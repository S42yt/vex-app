import { useSyncExternalStore } from "react";
import { discoverService } from "@/api/DiscoverService";
import type { DiscoverService, DiscoverState } from "@/api/DiscoverService";

export function useDiscover(): {
	discover: DiscoverState;
	service: DiscoverService;
} {
	const discover = useSyncExternalStore(
		discoverService.subscribe,
		discoverService.getSnapshot,
	);
	return { discover, service: discoverService };
}
