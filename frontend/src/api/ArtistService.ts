import type {
	CreateArtistParams,
	EditArtistParams,
	RemoteArtist,
} from "@/api/types";
import { playerController } from "@/player/PlayerController";
import { findMatchingArtist } from "@/lib/artistMatch";
import type { Track } from "@/player/types";
import { submitIdList } from "./idListEdit";
import type { IdListDraft } from "./idListEdit";
import { LibraryView, libraryData } from "./LibraryData";
import type { LibraryDataState } from "./LibraryData";
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

export class ArtistService extends LibraryView<ArtistsState> {
	protected snapshot: ArtistsState = {
		artists: [],
		loading: false,
		error: null,
	};
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

	protected sources(data: LibraryDataState): readonly unknown[] {
		return [data.artists];
	}

	protected rebuild(data: LibraryDataState): Partial<ArtistsState> {
		return {
			artists: [...data.artists].sort((a, b) => a.name.localeCompare(b.name)),
		};
	}

	protected syncQueue(): void {
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
}

export const artistService = new ArtistService();
