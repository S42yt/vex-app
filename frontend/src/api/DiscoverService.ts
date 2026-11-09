import type { MediaSearchResult, SearchSource } from "@/api/types";
import { storage } from "@/lib/storage";
import { importService, parseImportUrl } from "./ImportService";
import { bun } from "./rpc";

export interface DiscoverState {
	source: SearchSource;
	query: string;
	results: readonly MediaSearchResult[];
	loading: boolean;
	error: string | null;
}

export class DiscoverService {
	private subscribers = new Set<() => void>();
	private snapshot: DiscoverState = {
		source: storage.discover.source.get() ?? "youtube",
		query: "",
		results: [],
		loading: false,
		error: null,
	};
	private generation = 0;

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): DiscoverState => this.snapshot;

	setSource = (source: SearchSource): void => {
		if (source === this.snapshot.source) return;
		storage.discover.source.set(source);
		this.update({ source });
		this.retry();
	};

	search = async (query: string): Promise<void> => {
		const term = query.trim();
		if (!term) return;
		const generation = ++this.generation;
		this.update({ query: term, results: [], loading: true, error: null });
		try {
			const result = await bun.searchMedia({
				query: term,
				source: this.snapshot.source,
			});
			if (generation !== this.generation) return;
			this.update(
				result.ok
					? { results: result.results, loading: false }
					: { loading: false, error: result.error },
			);
		} catch (err) {
			if (generation !== this.generation) return;
			this.update({
				loading: false,
				error: err instanceof Error ? err.message : "Search failed",
			});
		}
	};

	retry = (): void => {
		if (this.snapshot.query) void this.search(this.snapshot.query);
	};

	download = (result: MediaSearchResult): void => {
		const url = parseImportUrl(result.url);
		if (url) void importService.start(url);
	};

	private update(patch: Partial<DiscoverState>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.subscribers.forEach((notify) => notify());
	}
}

export const discoverService = new DiscoverService();
