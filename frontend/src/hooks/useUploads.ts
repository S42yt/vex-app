import { useSyncExternalStore } from "react";
import { uploadService } from "@/api/UploadService";
import type { UploadState } from "@/api/UploadService";

export function useUploads(): UploadState {
	return useSyncExternalStore(
		uploadService.subscribe,
		uploadService.getSnapshot,
	);
}
