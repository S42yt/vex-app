import { useSyncExternalStore } from "react";
import { sessionService } from "@/api/SessionService";
import type { SessionService, SessionState } from "@/api/SessionService";

export function useSession(): {
	session: SessionState;
	service: SessionService;
} {
	const session = useSyncExternalStore(
		sessionService.subscribe,
		sessionService.getSnapshot,
	);
	return { session, service: sessionService };
}
