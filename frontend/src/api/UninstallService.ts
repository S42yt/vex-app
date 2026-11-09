import { bun } from "./rpc";

export interface UninstallState {
	removable: boolean | null;
	error: string | null;
	running: boolean;
}

export class UninstallService {
	private subscribers = new Set<() => void>();
	private snapshot: UninstallState = {
		removable: null,
		error: null,
		running: false,
	};
	private checking = false;

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): UninstallState => this.snapshot;

	check = async (): Promise<void> => {
		if (this.checking || this.snapshot.removable !== null) return;
		this.checking = true;
		try {
			const { removable } = await bun.canUninstall();
			this.update({ removable });
		} catch {
			this.update({ removable: false });
		} finally {
			this.checking = false;
		}
	};

	uninstall = async (): Promise<void> => {
		if (this.snapshot.running) return;
		this.update({ running: true, error: null });
		try {
			const result = await bun.uninstallApp();
			if (!result.ok) this.update({ running: false, error: result.error });
		} catch (err) {
			this.update({
				running: false,
				error:
					err instanceof Error ? err.message : "The uninstall never started",
			});
		}
	};

	private update(patch: Partial<UninstallState>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.subscribers.forEach((notify) => notify());
	}
}

export const uninstallService = new UninstallService();
