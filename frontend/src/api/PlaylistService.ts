import { playerController } from "@/player/PlayerController";
import type { Track } from "@/player/types";
import { MAX_TRACKS_PER_PLAYLIST } from "@/lib/limits";
import type {
	CreatePlaylistParams,
	EditPlaylistParams,
	RemotePlaylist,
} from "@/api/types";
import { submitIdList } from "./idListEdit";
import { LibraryView, libraryData } from "./LibraryData";
import type { LibraryDataState } from "./LibraryData";
import { libraryService } from "./LibraryService";
import { mutate } from "./mutate";
import type { MutationResult } from "./mutate";
import { bun } from "./rpc";
import { sessionService } from "./SessionService";

export function playlistQueueContext(playlistId: number): string {
	return `playlist-${playlistId}`;
}

export interface PlaylistsState {
	playlists: RemotePlaylist[];
	loading: boolean;
	error: string | null;
}

export class PlaylistService extends LibraryView<PlaylistsState> {
	protected snapshot: PlaylistsState = {
		playlists: [],
		loading: false,
		error: null,
	};
	private pendingOrders = new Map<number, string[]>();

	constructor() {
		super();
		sessionService.onStatusChange((status) => {
			if (status === "loggedOut") this.pendingOrders.clear();
		});
	}

	tracksOf(playlist: RemotePlaylist): Track[] {
		return libraryService.tracksByIds(playlist.trackIds);
	}

	play(playlist: RemotePlaylist, index = 0): void {
		playerController.playCollection(
			playlistQueueContext(playlist.id),
			this.tracksOf(playlist),
			index,
		);
	}

	playOrToggle(playlist: RemotePlaylist): void {
		playerController.playOrToggleCollection(
			playlistQueueContext(playlist.id),
			this.tracksOf(playlist),
		);
	}

	protected sources(data: LibraryDataState): readonly unknown[] {
		return [data.playlists];
	}

	protected rebuild(data: LibraryDataState): Partial<PlaylistsState> {
		return {
			playlists: data.playlists.map((playlist) => ({
				...playlist,
				trackIds: this.orderOf(playlist.id, [...new Set(playlist.trackIds)]),
			})),
		};
	}

	private orderOf(playlistId: number, serverTrackIds: string[]): string[] {
		const pending = this.pendingOrders.get(playlistId);
		if (!pending) return serverTrackIds;
		const remaining = new Set(serverTrackIds);
		const trackIds = pending.filter((id) => remaining.delete(id));
		return [...trackIds, ...serverTrackIds.filter((id) => remaining.has(id))];
	}

	private applyOrder(playlistId: number, trackIds: string[]): void {
		this.pendingOrders.set(playlistId, trackIds);
		this.update({
			playlists: this.snapshot.playlists.map((playlist) =>
				playlist.id === playlistId ? { ...playlist, trackIds } : playlist,
			),
		});
		this.syncQueue();

		void this.enqueue(async () => {
			const result = await this.edit({ id: playlistId, trackIds });
			const isLast = this.pendingOrders.get(playlistId) === trackIds;
			if (isLast) this.pendingOrders.delete(playlistId);
			if (!result.ok) {
				this.fail(result.error);
				if (isLast) await libraryData.refresh();
			}
		});
	}

	protected syncQueue(): void {
		const context = playerController.queueContextId;
		if (context === null) return;
		const playlist = this.snapshot.playlists.find(
			(candidate) => playlistQueueContext(candidate.id) === context,
		);
		if (!playlist) return;
		playerController.syncCollection(context, this.tracksOf(playlist));
	}

	async create(input: CreatePlaylistParams): Promise<MutationResult> {
		const result = await mutate(
			() => bun.createPlaylist(input),
			"Creating the playlist failed",
		);
		if (result.ok) await libraryData.refresh();
		return result;
	}

	async edit(input: EditPlaylistParams): Promise<MutationResult> {
		const result = await mutate(
			() => bun.editPlaylist(input),
			"Editing the playlist failed",
		);
		if (result.ok) await libraryData.refresh();
		return result;
	}

	private membershipChain: Promise<unknown> = Promise.resolve();

	private enqueue<T>(step: () => Promise<T>): Promise<T> {
		const run = this.membershipChain.then(step);
		this.membershipChain = run.catch(() => undefined);
		return run;
	}

	private chainMembershipEdit(
		playlistId: number,
		buildTrackIds: (current: readonly string[]) => string[] | null,
	): Promise<MutationResult> {
		return this.enqueue(async (): Promise<MutationResult> => {
			const result = await submitIdList({
				build: () => {
					const playlist = this.byId(playlistId);
					if (!playlist) return "stale";
					return buildTrackIds(playlist.trackIds) ?? "noop";
				},
				send: (trackIds) => this.edit({ id: playlistId, trackIds }),
				staleError: "Playlist not found.",
			});
			if (!result.ok) this.fail(result.error);
			return result;
		});
	}

	addTracks(
		playlistId: number,
		serverTrackIds: string[],
	): Promise<MutationResult> {
		const held = this.byId(playlistId)?.trackIds ?? [];
		const growth = [...new Set(serverTrackIds)].filter(
			(id) => !held.includes(id),
		).length;
		if (held.length + growth > MAX_TRACKS_PER_PLAYLIST) {
			const error = `A playlist holds at most ${MAX_TRACKS_PER_PLAYLIST} tracks.`;
			this.fail(error);
			return Promise.resolve({ ok: false, error });
		}
		return this.chainMembershipEdit(playlistId, (current) => {
			const additions = [...new Set(serverTrackIds)].filter(
				(id) => !current.includes(id),
			);
			if (additions.length === 0) return null;
			return [...additions, ...current];
		});
	}

	removeTracks(
		playlistId: number,
		serverTrackIds: string[],
	): Promise<MutationResult> {
		return this.chainMembershipEdit(playlistId, (current) => {
			const trackIds = current.filter((id) => !serverTrackIds.includes(id));
			return trackIds.length === current.length ? null : trackIds;
		});
	}

	moveTrack(
		playlistId: number,
		serverTrackId: string,
		direction: -1 | 1,
	): void {
		const current = this.byId(playlistId)?.trackIds;
		if (!current) return;
		const from = current.indexOf(serverTrackId);
		if (from === -1) return;
		const to = from + direction;
		if (to < 0 || to >= current.length) return;
		const trackIds = [...current];
		[trackIds[from], trackIds[to]] = [trackIds[to], trackIds[from]];
		this.applyOrder(playlistId, trackIds);
	}

	reorderTrack(
		playlistId: number,
		serverTrackId: string,
		targetServerTrackId: string,
	): void {
		const current = this.byId(playlistId)?.trackIds;
		if (!current) return;
		const from = current.indexOf(serverTrackId);
		const to = current.indexOf(targetServerTrackId);
		if (from === -1 || to === -1 || from === to) return;
		const trackIds = [...current];
		trackIds.splice(to, 0, ...trackIds.splice(from, 1));
		this.applyOrder(playlistId, trackIds);
	}

	async remove(id: number): Promise<void> {
		const result = await mutate(
			() => bun.deletePlaylist({ id }),
			"Deleting the playlist failed",
		);
		if (result.ok) void libraryData.refresh();
		else this.fail(result.error);
	}

	private byId(playlistId: number): RemotePlaylist | undefined {
		return this.snapshot.playlists.find(
			(playlist) => playlist.id === playlistId,
		);
	}
}

export const playlistService = new PlaylistService();
