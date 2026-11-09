// Capture real search pages exactly as MediaSearch.ts builds them (signals before ranking).
import { childEnv, cleanArtistName, ytDlpNumber, YT_DLP_BASE_ARGS } from "../../src/bun/ytDlp";

const BIN = `${process.env.LOCALAPPDATA}\\VexWave\\bin`;
const TEMPLATE = "%(.{id,title,duration,channel,channel_is_verified,uploader,webpage_url,url,thumbnails})j";
const QUERIES: [string, "ytsearch" | "scsearch"][] = [
	["beyonce halo", "ytsearch"],
	["sigur ros hoppipolla", "ytsearch"],
	["motley crue kickstart my heart", "ytsearch"],
	["celine dion my heart will go on", "ytsearch"],
	["daft punk around the world", "ytsearch"],
	["eric prydz opus original mix", "ytsearch"],
	["fisher losing it", "ytsearch"],
	["queen dont stop me now", "ytsearch"],
	["yoasobi 夜に駆ける", "ytsearch"],
	["кино группа крови", "ytsearch"],
	["rosalía despechá", "ytsearch"],
	["boiler room dj set", "ytsearch"],
	["pink floyd full album", "ytsearch"],
	["billie eilish bad guy live", "ytsearch"],
	["avicii levels remix", "ytsearch"],
	["mø lean on", "ytsearch"],
	["fred again marea", "scsearch"],
	["four tet baby", "scsearch"],
	["odesza say my name", "scsearch"],
	["björk army of me", "scsearch"],
];

async function capture([query, prefix]: (typeof QUERIES)[number]) {
	const proc = Bun.spawn(
		[`${BIN}\\yt-dlp.exe`, ...YT_DLP_BASE_ARGS, "--flat-playlist", "--print", `VEX>S ${TEMPLATE}`, `${prefix}24:${query}`],
		{ env: childEnv(BIN), stdout: "pipe", stderr: "pipe" },
	);
	const stdout = await new Response(proc.stdout).text();
	await proc.exited;
	const hits = [];
	for (const line of stdout.split(/\r?\n/)) {
		if (!line.startsWith("VEX>S ")) continue;
		const e = JSON.parse(line.slice(6));
		const title = e.title?.trim();
		if (!(e.webpage_url ?? e.url) || !title) continue;
		hits.push({
			id: String(e.id ?? e.url),
			signals: {
				title,
				creator: cleanArtistName(e.channel ?? e.uploader) ?? "",
				durationSec: ytDlpNumber(e.duration) ?? null,
				topicChannel: /\s-\s*Topic$/i.test(e.channel ?? ""),
				verified: e.channel_is_verified === true,
			},
		});
	}
	console.error(`${query}: ${hits.length} hits`);
	return { query, source: prefix, hits };
}

const out = [];
for (let i = 0; i < QUERIES.length; i += 5) {
	out.push(...(await Promise.all(QUERIES.slice(i, i + 5).map(capture))));
}
await Bun.write(new URL("pages.json", import.meta.url), JSON.stringify(out, null, 1));
