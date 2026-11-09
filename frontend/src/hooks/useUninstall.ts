import { useSyncExternalStore } from "react";
import { uninstallService } from "@/api/UninstallService";
import type { UninstallService, UninstallState } from "@/api/UninstallService";

export function useUninstall(): {
	uninstall: UninstallState;
	service: UninstallService;
} {
	const uninstall = useSyncExternalStore(
		uninstallService.subscribe,
		uninstallService.getSnapshot,
	);
	return { uninstall, service: uninstallService };
}
