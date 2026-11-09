import { useSyncExternalStore } from "react";
import { importService } from "@/api/ImportService";
import type { ImportsState } from "@/api/ImportService";

export function useImports(): ImportsState {
	return useSyncExternalStore(
		importService.subscribe,
		importService.getSnapshot,
	);
}
