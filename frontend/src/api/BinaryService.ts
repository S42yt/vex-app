import type {
	BinaryInstallStep,
	BinaryName,
	BinaryProgress,
} from "@/api/types";
import { backend, Event, failureOf, on } from "./rpc";
import { Store } from "@/lib/store";

export type BinaryPhase =
	| "checking"
	| "missing"
	| "installing"
	| "ready"
	| "error";

export interface BinaryProgressInfo {
	step: BinaryInstallStep;
	receivedBytes: number;
	totalBytes: number | null;
	part: number;
	partCount: number;
	done: boolean;
}

export interface BinariesState {
	phase: BinaryPhase;
	missing: BinaryName[];
	progress: Partial<Record<BinaryName, BinaryProgressInfo>>;
	error: string | null;

	updateAvailable: boolean;
	latestVersion: string | null;
	updating: boolean;
	updateProgress: BinaryProgressInfo | null;
	updateError: string | null;
	updateDismissed: boolean;
}

export class BinaryService extends Store<BinariesState> {
	protected snapshot: BinariesState = {
		phase: "checking",
		missing: [],
		progress: {},
		error: null,
		updateAvailable: false,
		latestVersion: null,
		updating: false,
		updateProgress: null,
		updateError: null,
		updateDismissed: false,
	};
	private updateCheckDone = false;

	constructor() {
		super();
		on(Event.BinariesProgress, (progress) => this.onProgress(progress));
		on(Event.BinariesInstalled, ({ binary }) => this.onInstalled(binary));
		on(Event.BinariesFinished, () => this.onFinished());
		on(Event.BinariesFailed, ({ error }) => this.onFailed(error));
	}

	async refreshStatus(): Promise<void> {
		let status;
		try {
			status = await backend.Binaries.GetBinaryStatus();
		} catch (err) {
			this.update({ phase: "error", error: failureOf(err).error });
			return;
		}
		if (status.missing.length === 0) {
			this.update({ phase: "ready", missing: [], progress: {}, error: null });
		} else {
			this.update({ phase: "missing", missing: status.missing, error: null });
		}
	}

	async install(proxyUrl: string): Promise<void> {
		const { phase, missing } = this.snapshot;
		if (phase !== "missing" && phase !== "error") return;
		const progress: BinariesState["progress"] = {};
		for (const binary of missing) {
			progress[binary] = {
				step: "downloading",
				receivedBytes: 0,
				totalBytes: null,
				part: 1,
				partCount: 1,
				done: false,
			};
		}
		this.update({ phase: "installing", progress, error: null });
		try {
			await backend.Binaries.InstallMissingBinaries({
				proxyUrl: proxyUrl || undefined,
			});
		} catch (err) {
			this.update({ phase: "error", error: failureOf(err).error });
		}
	}

	async retry(proxyUrl: string): Promise<void> {
		await this.refreshStatus();
		if (this.snapshot.phase === "missing") await this.install(proxyUrl);
	}

	async updateYtDlp(): Promise<void> {
		if (this.snapshot.updating) return;
		this.update({ updating: true, updateError: null, updateProgress: null });
		try {
			await backend.Binaries.UpdateYtDlp();
		} catch (err) {
			this.update({ updating: false, updateError: failureOf(err).error });
		}
	}

	async checkForUpdate(): Promise<void> {
		if (this.updateCheckDone) return;
		this.updateCheckDone = true;
		try {
			const result = await backend.Binaries.CheckYtDlpUpdate();
			if (result.updateAvailable) {
				this.update({
					updateAvailable: true,
					latestVersion: result.latestVersion ?? null,
				});
			}
		} catch {
		}
	}

	dismissUpdate(): void {
		this.update({ updateDismissed: true });
	}

	// While the first install runs, events are about it; afterwards they are a yt-dlp update's.
	private get installing(): boolean {
		return this.snapshot.phase === "installing";
	}

	private onProgress({ binary, ...progress }: BinaryProgress): void {
		const info: BinaryProgressInfo = {
			...progress,
			totalBytes: progress.totalBytes ?? null,
			done: false,
		};
		if (this.installing) {
			this.update({ progress: { ...this.snapshot.progress, [binary]: info } });
		} else {
			this.update({ updateProgress: info });
		}
	}

	private onInstalled(binary: BinaryName): void {
		const existing = this.snapshot.progress[binary];
		if (!this.installing || !existing) return;
		this.update({
			progress: {
				...this.snapshot.progress,
				[binary]: { ...existing, done: true },
			},
		});
	}

	private onFinished(): void {
		if (this.installing) {
			void this.refreshStatus();
		} else {
			this.update({
				updating: false,
				updateAvailable: false,
				updateProgress: null,
			});
		}
	}

	private onFailed(error: string): void {
		if (this.installing) {
			this.update({ phase: "error", error });
		} else {
			this.update({ updating: false, updateProgress: null, updateError: error });
		}
	}
}

export const binaryService = new BinaryService();

void binaryService.refreshStatus();
