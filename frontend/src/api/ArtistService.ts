import type {
	CreateArtistParams,
	EditArtistParams,
	RemoteArtist,
} from "@/api/types";
import { playerController } from "@/hooks/usePlayer";
import { findMatchingArtist } from "@/lib/artistMatch";
import type { Track } from "@/player/types";
import { submitIdList } from "./idListEdit";
import type { IdListDraft } from "./idListEdit";
import { libraryData } from "./LibraryData";
import { libraryService } from "./LibraryService";
import { mutate } from "./mutate";
import type { MutationResult } from "./mutate";
import { bun } from "./rpc";

export function artistQueueContext(artistId: number): string {
	return `artist-${artistId}`;
}

export interface ArtistsState {
	artists: RemoteArtist[];
	loading: boolean;
	error: string | null;
}

export class ArtistService {
	private subscribers = new Set<() => void>();
	private snapshot: ArtistsState = {
		artists: [],
		loading: false,
		error: null,
	};
	private mutationError: string | null = null;
	private builtFrom: RemoteArtist[] = libraryData.getSnapshot().artists;

	constructor() {
		libraryData.subscribe(() => this.apply());
	}

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): ArtistsState => this.snapshot;

	tracksOf(artist: RemoteArtist): Track[] {
		return libraryService.tracksOfArtist(artist.id);
	}

	play(artist: RemoteArtist, index = 0): void {
		playerController.playCollection(
			artistQueueContext(artist.id),
			this.tracksOf(artist),
			index,
		);
	}

	playOrToggle(artist: RemoteArtist): void {
		playerController.playOrToggleCollection(
			artistQueueContext(artist.id),
			this.tracksOf(artist),
		);
	}

	private apply(): void {
		const data = libraryData.getSnapshot();
		if (data.loading) this.mutationError = null;
		const error = this.mutationError ?? data.error;
		if (data.artists === this.builtFrom) {
			this.update({ loading: data.loading, error });
			return;
		}
		this.builtFrom = data.artists;
		const artists = [...data.artists].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		this.update({ artists, loading: data.loading, error });
		this.syncQueue();
	}

	private syncQueue(): void {
		const context = playerController.queueContextId;
		if (context === null) return;
		const artist = this.snapshot.artists.find(
			(candidate) => artistQueueContext(candidate.id) === context,
		);
		if (!artist) return;
		playerController.syncCollection(context, this.tracksOf(artist));
	}

	async create(input: CreateArtistParams): Promise<MutationResult> {
		const result = await mutate(
			() => bun.createArtist(input),
			"Creating the artist failed",
		);
		if (result.ok) await libraryData.refresh();
		return result;
	}

	async resolveOrCreate(
		input: CreateArtistParams,
	): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
		const known = findMatchingArtist(input.name, this.snapshot.artists);
		if (known) return { ok: true, id: known.id };
		await libraryData.refresh();
		const existing = findMatchingArtist(input.name, this.snapshot.artists);
		if (existing) return { ok: true, id: existing.id };

		const created = await this.create(input);
		if (!created.ok) return created;
		const now = findMatchingArtist(input.name, this.snapshot.artists);
		if (!now) {
			return {
				ok: false,
				error: "Artist was created but could not be found afterwards.",
			};
		}
		return { ok: true, id: now.id };
	}

	async edit(input: EditArtistParams): Promise<MutationResult> {
		const result = await mutate(
			() => bun.editArtist(input),
			"Editing the artist failed",
		);
		if (result.ok) void libraryData.refresh();
		return result;
	}

	async unlinkTrack(artist: RemoteArtist, trackId: string): Promise<void> {
		const result = await submitIdList({
			build: () => this.linksWithout(artist, trackId),
			send: (artistIds) => libraryService.editTrack(trackId, { artistIds }),
			staleError: `“${artist.name}” could not be unlinked — the library is out of date.`,
		});
		if (!result.ok) this.fail(result.error);
	}

	private linksWithout(
		artist: RemoteArtist,
		trackId: string,
	): IdListDraft<number> {
		const remote = libraryService.getRemote(trackId);
		if (!remote) return "noop";
		return remote.artistIds.filter((id) => id !== artist.id);
	}

	async remove(id: number): Promise<void> {
		const result = await mutate(
			() => bun.deleteArtist({ id }),
			"Deleting the artist failed",
		);
		if (result.ok) void libraryData.refresh();
		else this.fail(result.error);
	}

	private fail(error: string): void {
		this.mutationError = error;
		this.update({ error });
	}

	private update(patch: Partial<ArtistsState>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.subscribers.forEach((notify) => notify());
	}
}

export const artistService = new ArtistService();
