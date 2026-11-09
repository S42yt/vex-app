import { useSyncExternalStore } from "react";
import { playlistService } from "@/api/PlaylistService";
import type { PlaylistService, PlaylistsState } from "@/api/PlaylistService";

export function usePlaylists(): {
	playlists: PlaylistsState;
	service: PlaylistService;
} {
	const playlists = useSyncExternalStore(
		playlistService.subscribe,
		playlistService.getSnapshot,
	);
	return { playlists, service: playlistService };
}
