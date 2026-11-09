import { playerController } from "@/player/PlayerController";
import type { Track } from "@/player/types";
import type { EditTrackParams, RemoteTrack } from "@/api/types";
import { LibraryView, libraryData } from "./LibraryData";
import type { LibraryDataState } from "./LibraryData";
import { mutate } from "./mutate";
import type { MutationResult } from "./mutate";
import { backend } from "./rpc";
import { sessionService } from "./SessionService";

export const LIBRARY_QUEUE_CONTEXT = "library";

export interface LibraryState {
	tracks: Track[];
	loading: boolean;
	error: string | null;
}

export type EditTrackChanges = Omit<EditTrackParams, "id">;

export class LibraryService extends LibraryView<LibraryState> {
	protected snapshot: LibraryState = { tracks: [], loading: false, error: null };
	private remoteById = new Map<string, RemoteTrack>();
	private trackById = new Map<string, Track>();
	private tracksByArtistId = new Map<number, Track[]>();

	constructor() {
		super();
		sessionService.onStatusChange((status) => {
			if (status === "loggedOut") playerController.clearQueue();
		});
	}

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

	protected sources(data: LibraryDataState): readonly unknown[] {
		return [data.tracks, data.artists];
	}

	protected rebuild(data: LibraryDataState): Partial<LibraryState> {
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
		return { tracks };
	}

	protected syncQueue(): void {
		const { tracks } = this.snapshot;
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
		const result = await mutate(() => backend.Library.DeleteTrack({ id: remote.id }));
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
		const result = await mutate(() => backend.Library.EditTrack({ id: remote.id, ...changes }));
		if (result.ok) void libraryData.refresh();
		return result;
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
