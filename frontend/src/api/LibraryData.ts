import type { RemoteLibrary } from "@/api/types";
import { bun } from "./rpc";
import { sessionService } from "./SessionService";

export interface LibraryDataState extends RemoteLibrary {
	loading: boolean;
	error: string | null;
}

export class LibraryData {
	private subscribers = new Set<() => void>();
	private snapshot: LibraryDataState = {
		tracks: [],
		artists: [],
		playlists: [],
		loading: false,
		error: null,
	};
	private fetchSeq = 0;

	constructor() {
		let previousStatus = sessionService.getSnapshot().status;
		sessionService.subscribe(() => {
			const status = sessionService.getSnapshot().status;
			if (status === previousStatus) return;
			previousStatus = status;
			if (status === "loggedIn") {
				void this.refresh();
			} else if (status === "loggedOut") {
				this.fetchSeq += 1;
				this.update({
					tracks: [],
					artists: [],
					playlists: [],
					loading: false,
					error: null,
				});
			}
		});
	}

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): LibraryDataState => this.snapshot;

	async refresh(): Promise<boolean> {
		const seq = ++this.fetchSeq;
		this.update({ loading: true, error: null });
		let result;
		try {
			result = await bun.getLibrary();
		} catch (err) {
			if (seq !== this.fetchSeq) return true;
			this.update({
				loading: false,
				error:
					err instanceof Error ? err.message : "Failed to load the library",
			});
			return false;
		}
		if (seq !== this.fetchSeq) return true;
		if (!result.ok) {
			if (result.status === 401) {
				sessionService.markExpired("Session expired — please log in again.");
			}
			this.update({ loading: false, error: result.error });
			return false;
		}
		this.update({
			tracks: result.tracks,
			artists: result.artists,
			playlists: result.playlists,
			loading: false,
			error: null,
		});
		return true;
	}

	private update(patch: Partial<LibraryDataState>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.subscribers.forEach((notify) => notify());
	}
}

export const libraryData = new LibraryData();
