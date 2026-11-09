import { useSyncExternalStore } from "react";
import { downloadService } from "@/api/DownloadService";
import type { DownloadState } from "@/api/DownloadService";

export function useDownloads(): DownloadState {
	return useSyncExternalStore(
		downloadService.subscribe,
		downloadService.getSnapshot,
	);
}
