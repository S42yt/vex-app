import { backend, failureOf } from "./rpc";
import { Store } from "@/lib/store";

export interface UninstallState {
	removable: boolean | null;
	error: string | null;
	running: boolean;
}

export class UninstallService extends Store<UninstallState> {
	protected snapshot: UninstallState = {
		removable: null,
		error: null,
		running: false,
	};
	private checking = false;

	check = async (): Promise<void> => {
		if (this.checking || this.snapshot.removable !== null) return;
		this.checking = true;
		try {
			const { removable } = await backend.Uninstall.Removable();
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
			await backend.Uninstall.Start();
		} catch (err) {
			this.update({ running: false, error: failureOf(err).error });
		}
	};
}

export const uninstallService = new UninstallService();
