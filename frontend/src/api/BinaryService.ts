import type {
	BinaryInstallStep,
	BinaryName,
	BinaryProgressMessage,
} from "@/api/types";
import { bun, onBunMessage } from "./rpc";

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

export class BinaryService {
	private subscribers = new Set<() => void>();
	private snapshot: BinariesState = {
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

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): BinariesState => this.snapshot;

	async refreshStatus(): Promise<void> {
		let result;
		try {
			result = await bun.getBinaryStatus();
		} catch (err) {
			this.update({
				phase: "error",
				error: err instanceof Error ? err.message : "Binary check failed",
			});
			return;
		}
		if (!result.ok) {
			this.update({ phase: "error", error: result.error });
			return;
		}
		if (result.missing.length === 0) {
			this.update({ phase: "ready", missing: [], progress: {}, error: null });
		} else {
			this.update({ phase: "missing", missing: result.missing, error: null });
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
			const result = await bun.installMissingBinaries({
				proxyUrl: proxyUrl || undefined,
			});
			if (!result.ok) this.update({ phase: "error", error: result.error });
		} catch (err) {
			this.update({
				phase: "error",
				error: err instanceof Error ? err.message : "Install failed to start",
			});
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
			const result = await bun.updateYtDlp();
			if (!result.ok) this.update({ updating: false, updateError: result.error });
		} catch (err) {
			this.update({
				updating: false,
				updateError: err instanceof Error ? err.message : "Update failed to start",
			});
		}
	}

	async checkForUpdate(): Promise<void> {
		if (this.updateCheckDone) return;
		this.updateCheckDone = true;
		try {
			const result = await bun.checkYtDlpUpdate();
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

	handleProgress(msg: BinaryProgressMessage): void {
		if (this.snapshot.phase === "installing") {
			switch (msg.type) {
				case "progress":
					this.update({
						progress: {
							...this.snapshot.progress,
							[msg.binary]: {
								step: msg.step,
								receivedBytes: msg.receivedBytes,
								totalBytes: msg.totalBytes ?? null,
								part: msg.part,
								partCount: msg.partCount,
								done: false,
							},
						},
					});
					break;
				case "binaryInstalled": {
					const existing = this.snapshot.progress[msg.binary];
					if (!existing) break;
					this.update({
						progress: {
							...this.snapshot.progress,
							[msg.binary]: { ...existing, done: true },
						},
					});
					break;
				}
				case "finished":
					void this.refreshStatus();
					break;
				case "failed":
					this.update({ phase: "error", error: msg.error });
					break;
			}
			return;
		}
		switch (msg.type) {
			case "progress":
				this.update({
					updateProgress: {
						step: msg.step,
						receivedBytes: msg.receivedBytes,
						totalBytes: msg.totalBytes ?? null,
						part: msg.part,
						partCount: msg.partCount,
						done: false,
					},
				});
				break;
			case "finished":
				this.update({
					updating: false,
					updateAvailable: false,
					updateProgress: null,
				});
				break;
			case "failed":
				this.update({
					updating: false,
					updateProgress: null,
					updateError: msg.error,
				});
				break;
		}
	}

	private update(patch: Partial<BinariesState>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.subscribers.forEach((notify) => notify());
	}
}

export const binaryService = new BinaryService();

onBunMessage("binaryProgress", (msg) => {
	binaryService.handleProgress(msg);
});

void binaryService.refreshStatus();
