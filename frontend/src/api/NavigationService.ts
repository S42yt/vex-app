import { sessionService } from "./SessionService";
import { Store } from "@/lib/store";

const DETAIL_VIEWS = ["playlists", "artists"] as const;

type DetailViewName = (typeof DETAIL_VIEWS)[number];

export type MainView =
	| { name: "library" }
	| { name: "discover" }
	| { name: "settings" }
	| { name: DetailViewName; openId: number | null };

export type MainViewName = MainView["name"];

function hasDetail(name: MainViewName): name is DetailViewName {
	return (DETAIL_VIEWS as readonly MainViewName[]).includes(name);
}

function viewOf(name: MainViewName): MainView {
	return hasDetail(name) ? { name, openId: null } : { name };
}

const HOME: MainView = { name: "library" };

export function openIdOf(view: MainView): number | null {
	return "openId" in view ? view.openId : null;
}

export class NavigationService extends Store<MainView> {
	protected snapshot: MainView = HOME;

	constructor() {
		super();
		sessionService.onStatusChange((status) => {
			if (status === "loggedOut") this.reset();
		});
	}

	show = (name: MainViewName): void => {
		this.set(viewOf(name));
	};

	openPlaylist = (playlistId: number | null): void => {
		this.set({ name: "playlists", openId: playlistId });
	};

	openArtist = (artistId: number | null): void => {
		this.set({ name: "artists", openId: artistId });
	};

	private set(view: MainView): void {
		const current = this.snapshot;
		if (current.name === view.name && openIdOf(current) === openIdOf(view)) {
			return;
		}
		this.publish(view);
	}

	private reset(): void {
		this.set(HOME);
	}
}

export const navigationService = new NavigationService();
