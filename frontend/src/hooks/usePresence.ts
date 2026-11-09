import { useSyncExternalStore } from "react";
import { presenceService } from "@/api/PresenceService";
import type { PresenceService, PresenceState } from "@/api/PresenceService";

export function usePresence(): {
	presence: PresenceState;
	service: PresenceService;
} {
	const presence = useSyncExternalStore(
		presenceService.subscribe,
		presenceService.getSnapshot,
	);
	return { presence, service: presenceService };
}
