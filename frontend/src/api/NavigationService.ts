import { sessionService } from "./SessionService";

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

export class NavigationService {
	private subscribers = new Set<() => void>();
	private resume = new Map<SectionName, MainView>();
	private snapshot: MainView = viewOf(HOME_SECTION);

	constructor() {
		let previousStatus = sessionService.getSnapshot().status;
		sessionService.subscribe(() => {
			const status = sessionService.getSnapshot().status;
			if (status === previousStatus) return;
			previousStatus = status;
			if (status === "loggedOut") this.reset();
		});
	}

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): MainView => this.snapshot;

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
		this.snapshot = view;
		this.subscribers.forEach((notify) => notify());
	}

	private reset(): void {
		this.resume.clear();
		this.set(viewOf(HOME_SECTION));
	}
}

export const navigationService = new NavigationService();
