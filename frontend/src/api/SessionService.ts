import { storage } from "@/lib/storage";
import type { RpcFailure } from "@/api/types";
import { bun, onBunMessage } from "./rpc";

export type SessionStatus = "loggedOut" | "loggingIn" | "loggedIn";

export interface SessionState {
	status: SessionStatus;
	error: string | null;
	lastServerUrl: string;
	proxyUrl: string;
	proxyError: string | null;
	savingProxy: boolean;
	proxyRetryAfter: number | null;
	restoring: boolean;
	retryAfter: number | null;
}

export class SessionService {
	private subscribers = new Set<() => void>();
	private snapshot: SessionState;

	constructor() {
		const baseUrl = storage.session.url.get() ?? "";
		const token = storage.session.token.get() ?? "";
		this.snapshot = {
			status: "loggedOut",
			error: null,
			lastServerUrl: baseUrl,
			proxyUrl: storage.session.proxy.get() ?? "",
			proxyError: null,
			savingProxy: false,
			proxyRetryAfter: null,
			restoring: !!baseUrl && !!token,
			retryAfter: null,
		};
		if (this.snapshot.restoring) void this.restore(baseUrl, token);
	}

	private async restore(baseUrl: string, token: string): Promise<void> {
		try {
			const result = await bun.restoreSession({
				baseUrl,
				token,
				proxyUrl: this.snapshot.proxyUrl || undefined,
			});
			if (result.ok) {
				this.update({ status: "loggedIn", restoring: false });
				return;
			}
		} catch {
		}
		this.clearStoredToken();
		this.update({ status: "loggedOut", restoring: false });
	}

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): SessionState => this.snapshot;

	async login(
		baseUrl: string,
		username: string,
		password: string,
		proxyUrl: string,
	): Promise<void> {
		if (this.snapshot.status === "loggingIn") return;
		if (this.snapshot.retryAfter !== null && Date.now() < this.snapshot.retryAfter) {
			return;
		}
		this.update({ status: "loggingIn", error: null, retryAfter: null });
		let result;
		try {
			result = await bun.login({
				baseUrl,
				username,
				password,
				proxyUrl: proxyUrl || undefined,
			});
		} catch (err) {
			this.update({
				status: "loggedOut",
				error: err instanceof Error ? err.message : "Login request failed",
			});
			return;
		}
		if (result.ok) {
			storage.session.url.set(baseUrl);
			storage.session.token.set(result.token);
			this.storeProxy(proxyUrl);
			this.update({
				status: "loggedIn",
				lastServerUrl: baseUrl,
				proxyUrl,
				proxyError: null,
			});
		} else {
			this.update({
				status: "loggedOut",
				error: result.error,
				retryAfter: retryDeadline(result),
			});
		}
	}

	async setProxy(proxyUrl: string): Promise<void> {
		const { savingProxy, proxyRetryAfter } = this.snapshot;
		if (savingProxy) return;
		if (proxyRetryAfter !== null && Date.now() < proxyRetryAfter) return;
		this.update({ savingProxy: true, proxyError: null, proxyRetryAfter: null });
		let result;
		try {
			result = await bun.setProxy({ proxyUrl: proxyUrl || undefined });
		} catch (err) {
			this.update({
				savingProxy: false,
				proxyError: err instanceof Error ? err.message : "Saving the proxy failed",
			});
			return;
		}
		if (result.ok) {
			this.storeProxy(proxyUrl);
			this.update({ savingProxy: false, proxyUrl });
		} else if (result.status === 401) {
			this.update({ savingProxy: false });
			this.markExpired("Session expired — please log in again.");
		} else {
			this.update({
				savingProxy: false,
				proxyError: result.error,
				proxyRetryAfter: retryDeadline(result),
			});
		}
	}

	async logout(): Promise<void> {
		this.clearStoredToken();
		try {
			await bun.logout();
		} catch {
		}
		this.update({ status: "loggedOut", error: null });
	}

	markExpired(message: string): void {
		this.clearStoredToken();
		this.update({ status: "loggedOut", error: message });
	}

	private clearStoredToken(): void {
		storage.session.token.remove();
	}

	private storeProxy(proxyUrl: string): void {
		if (proxyUrl) storage.session.proxy.set(proxyUrl);
		else storage.session.proxy.remove();
	}

	private update(patch: Partial<SessionState>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.subscribers.forEach((notify) => notify());
	}
}

function retryDeadline(failure: RpcFailure): number | null {
	return failure.retryAfterSec === undefined
		? null
		: Date.now() + failure.retryAfterSec * 1000;
}

export const sessionService = new SessionService();

onBunMessage("sessionExpired", ({ reason }) => {
	sessionService.markExpired(reason);
});
