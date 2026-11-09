import { useSyncExternalStore } from "react";
import { binaryService } from "@/api/BinaryService";
import type { BinariesState, BinaryService } from "@/api/BinaryService";

export function useBinaries(): {
	binaries: BinariesState;
	service: BinaryService;
} {
	const binaries = useSyncExternalStore(
		binaryService.subscribe,
		binaryService.getSnapshot,
	);
	return { binaries, service: binaryService };
}
