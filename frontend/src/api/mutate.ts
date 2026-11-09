import type { RpcFailure } from "@/api/types";
import { sessionService } from "./SessionService";

export type MutationResult = { ok: true } | { ok: false; error: string };

export async function mutate(
	send: () => Promise<{ ok: true } | RpcFailure>,
	fallback: string,
): Promise<MutationResult> {
	let result;
	try {
		result = await send();
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : fallback };
	}
	if (result.ok) return { ok: true };
	if (result.status === 401) {
		sessionService.markExpired();
	}
	return { ok: false, error: result.error };
}
