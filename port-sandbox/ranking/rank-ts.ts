// Ranks every page with the app's own searchRanking.ts and writes the order (and, via a
// score-exposing copy whose order is asserted identical, the scores) to ts-out.json.
import { rankHits } from "../../src/bun/searchRanking";
import { synthetic } from "./synthetic";

const src = await Bun.file(new URL("../../src/bun/searchRanking.ts", import.meta.url)).text();
const patched = src.replace(".map((scored) => scored.hit);", ".map((scored) => ({ ...scored.hit, score: scored.score }));");
if (patched === src) throw new Error("patch point moved");
await Bun.write(new URL("searchRanking.scored.ts", import.meta.url), patched);
const { rankHits: rankScored } = await import("./searchRanking.scored.ts");

const pages = [...(await Bun.file(new URL("pages.json", import.meta.url)).json()), ...synthetic];
await Bun.write(new URL("all-pages.json", import.meta.url), JSON.stringify(pages));

const out = pages.map((p: any) => {
	const hits = p.hits.map((h: any) => ({ ...h, signals: { ...h.signals, durationSec: h.signals.durationSec ?? undefined } }));
	const order = rankHits(hits, p.query).map((h: any) => h.id);
	const scored = rankScored(hits, p.query) as any[];
	if (scored.map((h) => h.id).join() !== order.join()) throw new Error("copy diverged");
	return { query: p.query, order, scores: scored.map((h) => h.score) };
});
await Bun.write(new URL("ts-out.json", import.meta.url), JSON.stringify(out));
console.log(`ranked ${out.length} pages`);
