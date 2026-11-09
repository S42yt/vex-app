import { useSyncExternalStore } from "react";
import { appUpdateService } from "@/api/AppUpdateService";
import type { AppUpdateService, AppUpdateState } from "@/api/AppUpdateService";

export function useAppUpdate(): {
	update: AppUpdateState;
	service: AppUpdateService;
} {
	const update = useSyncExternalStore(
		appUpdateService.subscribe,
		appUpdateService.getSnapshot,
	);
	return { update, service: appUpdateService };
}
