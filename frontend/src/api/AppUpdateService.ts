import type {
	AppUpdateProgressMessage,
	InstallAppUpdateResult,
} from "@/api/types";
import { mutate } from "./mutate";
import { bun, onBunMessage } from "./rpc";

type AppUpdatePhase = "idle" | "downloading" | "ready" | "installing";

export interface AppUpdateState {
	latestVersion: string | null;
	phase: AppUpdatePhase;
	receivedBytes: number;
	totalBytes: number | null;
	error: string | null;
	dismissed: boolean;
}

export class AppUpdateService {
	private subscribers = new Set<() => void>();
	private snapshot: AppUpdateState = {
		latestVersion: null,
		phase: "idle",
		receivedBytes: 0,
		totalBytes: null,
		error: null,
		dismissed: false,
	};
	private checkDone = false;

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): AppUpdateState => this.snapshot;

	async checkForUpdate(): Promise<void> {
		if (this.checkDone) return;
		this.checkDone = true;
		try {
			const { latestVersion } = await bun.checkAppUpdate();
			if (latestVersion) this.update({ latestVersion });
		} catch {
		}
	}

	async download(): Promise<void> {
		if (this.snapshot.phase !== "idle") return;
		this.update({
			phase: "downloading",
			receivedBytes: 0,
			totalBytes: null,
			error: null,
		});
		const result = await mutate(
			() => bun.downloadAppUpdate(),
			"Update failed to start",
		);
		if (!result.ok) this.update({ phase: "idle", error: result.error });
	}

	async install(): Promise<void> {
		if (this.snapshot.phase !== "ready") return;
		this.update({ phase: "installing", error: null });
		let result: InstallAppUpdateResult;
		try {
			result = await bun.installAppUpdate();
		} catch (err) {
			result = {
				ok: false,
				error: err instanceof Error ? err.message : "Update failed to start",
			};
		}
		if (result.ok) return;
		this.update({
			phase: "downloadMissing" in result ? "idle" : "ready",
			error: result.error,
		});
	}

	retry(): Promise<void> {
		return this.snapshot.phase === "ready" ? this.install() : this.download();
	}

	dismiss(): void {
		this.update({ dismissed: true });
	}

	handleProgress(msg: AppUpdateProgressMessage): void {
		if (this.snapshot.phase !== "downloading") return;
		switch (msg.type) {
			case "progress":
				this.update({
					receivedBytes: msg.receivedBytes,
					totalBytes: msg.totalBytes ?? null,
				});
				break;
			case "ready":
				this.update({ phase: "ready" });
				break;
			case "failed":
				this.update({ phase: "idle", error: msg.error });
				break;
		}
	}

	private update(patch: Partial<AppUpdateState>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.subscribers.forEach((notify) => notify());
	}
}

export const appUpdateService = new AppUpdateService();

onBunMessage("appUpdateProgress", (msg) => {
	appUpdateService.handleProgress(msg);
});
