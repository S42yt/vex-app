import { libraryData } from "./LibraryData";
import type { MutationResult } from "./mutate";

export type IdListDraft<Id extends string | number> = Id[] | "noop" | "stale";

export async function submitIdList<Id extends string | number>(edit: {
	build: () => IdListDraft<Id>;
	send: (ids: Id[]) => Promise<MutationResult>;
	staleError: string;
}): Promise<MutationResult> {
	const rebuild = async () => {
		await libraryData.refresh();
		return edit.build();
	};

	let ids = edit.build();
	if (ids === "stale") ids = await rebuild();
	if (ids === "noop") return { ok: true };
	if (ids === "stale") return { ok: false, error: edit.staleError };

	const result = await edit.send(ids);
	if (result.ok) return result;

	const rebuilt = await rebuild();
	if (rebuilt === "noop") return { ok: true };
	if (rebuilt === "stale") return { ok: false, error: edit.staleError };
	return sameIds(ids, rebuilt) ? result : await edit.send(rebuilt);
}

function sameIds<Id extends string | number>(a: Id[], b: Id[]): boolean {
	return a.length === b.length && a.every((id, index) => id === b[index]);
}
