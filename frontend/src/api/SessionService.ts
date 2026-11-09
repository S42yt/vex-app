import { storage } from "@/lib/storage";
import type { Failure } from "@/api/types";
import { backend, Event, failureOf, on } from "./rpc";
import { Store } from "@/lib/store";

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

export class SessionService extends Store<SessionState> {
	protected snapshot: SessionState;

	constructor() {
		super();
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
			await backend.Session.RestoreSession({
				baseUrl,
				token,
				proxyUrl: this.snapshot.proxyUrl || undefined,
			});
			this.update({ status: "loggedIn", restoring: false });
		} catch {
			this.clearStoredToken();
			this.update({ status: "loggedOut", restoring: false });
		}
	}

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
		let token;
		try {
			token = await backend.Session.Login({
				baseUrl,
				username,
				password,
				proxyUrl: proxyUrl || undefined,
			});
		} catch (err) {
			const failure = failureOf(err);
			this.update({
				status: "loggedOut",
				error: failure.error,
				retryAfter: retryDeadline(failure),
			});
			return;
		}
		storage.session.url.set(baseUrl);
		storage.session.token.set(token);
		this.storeProxy(proxyUrl);
		this.update({
			status: "loggedIn",
			lastServerUrl: baseUrl,
			proxyUrl,
			proxyError: null,
		});
	}

	async setProxy(proxyUrl: string): Promise<void> {
		const { savingProxy, proxyRetryAfter } = this.snapshot;
		if (savingProxy) return;
		if (proxyRetryAfter !== null && Date.now() < proxyRetryAfter) return;
		this.update({ savingProxy: true, proxyError: null, proxyRetryAfter: null });
		try {
			await backend.Session.SetProxy({ proxyUrl: proxyUrl || undefined });
		} catch (err) {
			const failure = failureOf(err);
			this.update({ savingProxy: false });
			if (failure.status === 401) {
				this.markExpired();
			} else {
				this.update({
					proxyError: failure.error,
					proxyRetryAfter: retryDeadline(failure),
				});
			}
			return;
		}
		this.storeProxy(proxyUrl);
		this.update({ savingProxy: false, proxyUrl });
	}

	async logout(): Promise<void> {
		this.clearStoredToken();
		try {
			await backend.Session.Logout();
		} catch {
		}
		this.update({ status: "loggedOut", error: null });
	}

	onStatusChange(listener: (status: SessionStatus) => void): void {
		let previous = this.snapshot.status;
		this.subscribe(() => {
			const { status } = this.snapshot;
			if (status === previous) return;
			previous = status;
			listener(status);
		});
	}

	markExpired(message = "Session expired — please log in again."): void {
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
}

function retryDeadline(failure: Failure): number | null {
	return failure.retryAfterSec === undefined
		? null
		: Date.now() + failure.retryAfterSec * 1000;
}

export const sessionService = new SessionService();

on(Event.SessionExpired, ({ reason }) => {
	sessionService.markExpired(reason);
});
