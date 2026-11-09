import { useSyncExternalStore } from "react";
import { libraryService } from "@/api/LibraryService";
import type { LibraryService, LibraryState } from "@/api/LibraryService";

export function useLibrary(): {
	library: LibraryState;
	service: LibraryService;
} {
	const library = useSyncExternalStore(
		libraryService.subscribe,
		libraryService.getSnapshot,
	);
	return { library, service: libraryService };
}
