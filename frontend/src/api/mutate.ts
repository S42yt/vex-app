import { failureOf } from "./rpc";
import { sessionService } from "./SessionService";

export type MutationResult = { ok: true } | { ok: false; error: string };

export async function mutate(send: () => Promise<unknown>): Promise<MutationResult> {
	try {
		await send();
		return { ok: true };
	} catch (err) {
		const failure = failureOf(err);
		if (failure.status === 401) sessionService.markExpired();
		return { ok: false, error: failure.error };
	}
}
