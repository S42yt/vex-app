import { playerController } from "@/hooks/usePlayer";
import type { Track } from "@/player/types";
import type { EditTrackParams, RemoteTrack } from "@/api/types";
import { libraryData } from "./LibraryData";
import type { LibraryDataState } from "./LibraryData";
import { mutate } from "./mutate";
import type { MutationResult } from "./mutate";
import { bun } from "./rpc";
import { sessionService } from "./SessionService";

export const LIBRARY_QUEUE_CONTEXT = "library";

export interface LibraryState {
	tracks: Track[];
	loading: boolean;
	error: string | null;
}

export type EditTrackChanges = Omit<EditTrackParams, "id">;

export class LibraryService {
	private subscribers = new Set<() => void>();
	private snapshot: LibraryState = { tracks: [], loading: false, error: null };
	private remoteById = new Map<string, RemoteTrack>();
	private trackById = new Map<string, Track>();
	private tracksByArtistId = new Map<number, Track[]>();
	private mutationError: string | null = null;
	private builtFrom: Pick<LibraryDataState, "tracks" | "artists"> =
		libraryData.getSnapshot();

	constructor() {
		libraryData.subscribe(() => this.apply());

		let previousStatus = sessionService.getSnapshot().status;
		sessionService.subscribe(() => {
			const status = sessionService.getSnapshot().status;
			if (status === previousStatus) return;
			previousStatus = status;
			if (status === "loggedOut") playerController.clearQueue();
		});
	}

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): LibraryState => this.snapshot;

	getTrack(trackId: string): Track | undefined {
		return this.trackById.get(trackId);
	}

	getRemote(trackId: string): RemoteTrack | undefined {
		return this.remoteById.get(trackId);
	}

	tracksByIds(trackIds: readonly string[]): Track[] {
		const tracks: Track[] = [];
		for (const trackId of trackIds) {
			const track = this.trackById.get(trackId);
			if (track) tracks.push(track);
		}
		return tracks;
	}

	tracksOfArtist(artistId: number): Track[] {
		return this.tracksByArtistId.get(artistId) ?? [];
	}

	trackIds(): ReadonlySet<string> {
		return new Set(this.remoteById.keys());
	}

	newestSince(known: ReadonlySet<string>): Track | null {
		return this.snapshot.tracks.find((track) => !known.has(track.id)) ?? null;
	}

	private apply(): void {
		const data = libraryData.getSnapshot();
		if (data.loading) this.mutationError = null;
		const error = this.mutationError ?? data.error;
		if (
			data.tracks === this.builtFrom.tracks &&
			data.artists === this.builtFrom.artists
		) {
			this.update({ loading: data.loading, error });
			return;
		}
		this.builtFrom = data;
		const remotes = [...data.tracks].reverse();
		this.remoteById = new Map(remotes.map((remote) => [remote.id, remote]));
		const namesById = new Map(data.artists.map(({ id, name }) => [id, name]));
		const tracks = remotes.map((remote) => toTrack(remote, namesById));
		this.trackById = new Map(tracks.map((track) => [track.id, track]));
		this.tracksByArtistId = new Map();
		tracks.forEach((track, index) => {
			for (const artistId of remotes[index].artistIds) {
				const credited = this.tracksByArtistId.get(artistId);
				if (credited) credited.push(track);
				else this.tracksByArtistId.set(artistId, [track]);
			}
		});
		this.update({ tracks, loading: data.loading, error });
		this.syncQueue(tracks);
	}

	private syncQueue(tracks: Track[]): void {
		const context = playerController.queueContextId;
		if (context === null || context === LIBRARY_QUEUE_CONTEXT) {
			playerController.syncCollection(LIBRARY_QUEUE_CONTEXT, tracks);
			return;
		}
		for (const track of tracks) {
			playerController.updateTrack(track.id, {
				title: track.title,
				artist: track.artist,
				coverUrl: track.coverUrl,
				durationSec: track.durationSec,
			});
		}
		playerController.removeTracks((track) => !this.remoteById.has(track.id));
	}

	play(index = 0): void {
		playerController.playCollection(
			LIBRARY_QUEUE_CONTEXT,
			this.snapshot.tracks,
			index,
		);
	}

	playTrack(trackId: string): void {
		const index = this.snapshot.tracks.findIndex(
			(track) => track.id === trackId,
		);
		if (index !== -1) this.play(index);
	}

	async removeTrack(trackId: string): Promise<void> {
		const remote = this.remoteById.get(trackId);
		if (!remote) return;
		const result = await mutate(
			() => bun.deleteTrack({ id: remote.id }),
			"Deleting the track failed",
		);
		if (result.ok) void libraryData.refresh();
		else this.fail(result.error);
	}

	async editTrack(
		trackId: string,
		changes: EditTrackChanges,
	): Promise<MutationResult> {
		const remote = this.remoteById.get(trackId);
		if (!remote) {
			return { ok: false, error: "Only server tracks can be edited." };
		}
		const result = await mutate(
			() => bun.editTrack({ id: remote.id, ...changes }),
			"Editing the track failed",
		);
		if (result.ok) void libraryData.refresh();
		return result;
	}

	private fail(error: string): void {
		this.mutationError = error;
		this.update({ error });
	}

	private update(patch: Partial<LibraryState>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.subscribers.forEach((notify) => notify());
	}
}

function toTrack(remote: RemoteTrack, names: Map<number, string>): Track {
	const credited = remote.artistIds
		.map((artistId) => names.get(artistId))
		.filter((name): name is string => name !== undefined);
	return {
		id: remote.id,
		title: remote.title,
		artist: credited.join(", ") || undefined,
		durationSec: remote.durationMs / 1000,
		coverUrl: remote.coverUrl,
		src: remote.streamUrl,
	};
}

export const libraryService = new LibraryService();
