import { useSyncExternalStore } from "react";
import { artistService } from "@/api/ArtistService";
import type { ArtistService, ArtistsState } from "@/api/ArtistService";

export function useArtists(): {
	artists: ArtistsState;
	service: ArtistService;
} {
	const artists = useSyncExternalStore(
		artistService.subscribe,
		artistService.getSnapshot,
	);
	return { artists, service: artistService };
}
