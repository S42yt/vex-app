import { useSyncExternalStore } from "react";
import { navigationService, sectionOf } from "@/api/NavigationService";
import type {
	MainView,
	NavigationService,
	SectionName,
} from "@/api/NavigationService";

export function useNavigation(): {
	view: MainView;
	section: SectionName;
	service: NavigationService;
} {
	const view = useSyncExternalStore(
		navigationService.subscribe,
		navigationService.getSnapshot,
	);
	return { view, section: sectionOf(view), service: navigationService };
}
