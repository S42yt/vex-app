import type { RemoteLibrary } from "@/api/types";
import { backend, failureOf } from "./rpc";
import { sessionService } from "./SessionService";
import { Store } from "@/lib/store";

export interface LibraryDataState extends RemoteLibrary {
	loading: boolean;
	error: string | null;
}

export class LibraryData extends Store<LibraryDataState> {
	protected snapshot: LibraryDataState = {
		tracks: [],
		artists: [],
		playlists: [],
		loading: false,
		error: null,
	};
	private fetchSeq = 0;

	constructor() {
		super();
		sessionService.onStatusChange((status) => {
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

	async refresh(): Promise<boolean> {
		const seq = ++this.fetchSeq;
		this.update({ loading: true, error: null });
		let result;
		try {
			result = await backend.Library.GetLibrary();
		} catch (err) {
			if (seq !== this.fetchSeq) return true;
			const failure = failureOf(err);
			if (failure.status === 401) sessionService.markExpired();
			this.update({ loading: false, error: failure.error });
			return false;
		}
		if (seq !== this.fetchSeq) return true;
		this.update({
			tracks: result.tracks,
			artists: result.artists,
			playlists: result.playlists,
			loading: false,
			error: null,
		});
		return true;
	}
}

export const libraryData = new LibraryData();

interface LibraryViewState {
	loading: boolean;
	error: string | null;
}

// A store derived from the library: rebuilt when its sources change, with a failed
// mutation's error standing until the next load.
export abstract class LibraryView<S extends LibraryViewState> extends Store<S> {
	private mutationError: string | null = null;
	private builtFrom: readonly unknown[];

	constructor() {
		super();
		this.builtFrom = this.sources(libraryData.getSnapshot());
		libraryData.subscribe(() => this.apply());
	}

	protected abstract sources(data: LibraryDataState): readonly unknown[];
	protected abstract rebuild(data: LibraryDataState): Partial<S>;
	protected abstract syncQueue(): void;

	protected fail(error: string): void {
		this.mutationError = error;
		this.update({ error } as Partial<S>);
	}

	private apply(): void {
		const data = libraryData.getSnapshot();
		if (data.loading) this.mutationError = null;
		const status = {
			loading: data.loading,
			error: this.mutationError ?? data.error,
		} as Partial<S>;
		const sources = this.sources(data);
		if (sources.every((source, i) => source === this.builtFrom[i])) {
			this.update(status);
			return;
		}
		this.builtFrom = sources;
		this.update({ ...this.rebuild(data), ...status });
		this.syncQueue();
	}
}
