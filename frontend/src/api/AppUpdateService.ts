import { mutate } from "./mutate";
import { backend, Event, failureOf, on } from "./rpc";
import { Store } from "@/lib/store";

type AppUpdatePhase = "idle" | "downloading" | "ready" | "installing";

export interface AppUpdateState {
	latestVersion: string | null;
	phase: AppUpdatePhase;
	receivedBytes: number;
	totalBytes: number | null;
	error: string | null;
	dismissed: boolean;
}

export class AppUpdateService extends Store<AppUpdateState> {
	protected snapshot: AppUpdateState = {
		latestVersion: null,
		phase: "idle",
		receivedBytes: 0,
		totalBytes: null,
		error: null,
		dismissed: false,
	};
	private checkDone = false;

	constructor() {
		super();
		on(Event.UpdateProgress, ({ written, total }) => {
			if (this.downloading) {
				this.update({ receivedBytes: written, totalBytes: total > 0 ? total : null });
			}
		});
		on(Event.UpdateReady, () => {
			if (this.downloading) this.update({ phase: "ready" });
		});
		on(Event.UpdateError, ({ stage, message }) => {
			if (this.downloading && stage !== "check") {
				this.update({ phase: "idle", error: message });
			}
		});
	}

	private get downloading(): boolean {
		return this.snapshot.phase === "downloading";
	}

	async checkForUpdate(): Promise<void> {
		if (this.checkDone) return;
		this.checkDone = true;
		try {
			const { latestVersion } = await backend.Update.Check();
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
		const result = await mutate(() => backend.Update.Download());
		if (!result.ok) this.update({ phase: "idle", error: result.error });
	}

	async install(): Promise<void> {
		if (this.snapshot.phase !== "ready") return;
		this.update({ phase: "installing", error: null });
		try {
			await backend.Update.Install();
		} catch (err) {
			const failure = failureOf(err);
			this.update({
				phase: failure.downloadMissing ? "idle" : "ready",
				error: failure.error,
			});
		}
	}

	retry(): Promise<void> {
		return this.snapshot.phase === "ready" ? this.install() : this.download();
	}

	dismiss(): void {
		this.update({ dismissed: true });
	}

}

export const appUpdateService = new AppUpdateService();
