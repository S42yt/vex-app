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

const SECTION_OF = {
	library: "library",
	playlists: "library",
	artists: "library",
	discover: "discover",
	settings: "settings",
} as const satisfies Record<MainViewName, MainViewName>;

export type SectionName = {
	[V in MainViewName]: (typeof SECTION_OF)[V] extends V ? V : never;
}[MainViewName];

const HOME_SECTION: SectionName = "library";

function hasDetail(name: MainViewName): name is DetailViewName {
	return (DETAIL_VIEWS as readonly MainViewName[]).includes(name);
}

export function sectionOf(view: MainView): SectionName {
	return SECTION_OF[view.name];
}

function viewOf(name: MainViewName): MainView {
	return hasDetail(name) ? { name, openId: null } : { name };
}

export function openIdOf(view: MainView): number | null {
	return "openId" in view ? view.openId : null;
}

export class NavigationService extends Store<MainView> {
	private resume = new Map<SectionName, MainView>();
	protected snapshot: MainView = viewOf(HOME_SECTION);

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

	showSection = (name: SectionName): void => {
		this.set(this.resume.get(name) ?? viewOf(name));
	};

	private set(view: MainView): void {
		const current = this.snapshot;
		if (current.name === view.name && openIdOf(current) === openIdOf(view)) {
			return;
		}
		this.resume.set(sectionOf(view), view);
		this.publish(view);
	}

	private reset(): void {
		this.resume.clear();
		this.set(viewOf(HOME_SECTION));
	}
}

export const navigationService = new NavigationService();
