// What src/mainview/api/UploadService.ts reads with music-metadata, for the fixtures.
import { parseBlob } from "../../node_modules/music-metadata/lib/index.js";

const out: Record<string, unknown> = {};
for (const name of ["tagged.mp3", "tagged.m4a", "tagged.flac", "untagged.ogg"]) {
	const file = Bun.file(new URL(name, import.meta.url));
	const blob = new Blob([await file.arrayBuffer()], { type: file.type });
	const m = await parseBlob(blob);
	const pic = m.common.picture?.[0];
	out[name] = {
		title: m.common.title ?? null,
		durationMs: m.format.duration === undefined ? null : Math.round(m.format.duration * 1000),
		coverBytes: pic ? pic.data.byteLength : 0,
		format: pic?.format ?? null,
	};
}
console.log(JSON.stringify(out));
