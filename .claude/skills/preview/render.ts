/**
 * Renders views of the app to transparent PNGs — see SKILL.md for what this is
 * for and why it is built this way.
 *
 *   bun .claude/skills/preview/render.ts [views…] [flags]
 *
 * Views are any `MainViewName` — `library` `discover` `settings` `playlists`
 * `artists` at the time of writing — defaulting to `library`. `playlists@1`
 * opens that item's detail view and lands in `playlists-1.png`.
 *
 * Flags: --out=preview · --scale=1.5 · --no-check (skip the type-check) ·
 * --keep (leave the harness in src/) · --still (see below).
 *
 * What it renders is entirely `harness/__preview-app.tsx`'s business; nothing
 * about the data lives here. This file is outside every tsconfig project, so
 * nothing type-checks it — the harness it copies is checked, by default.
 */
import { mkdir, copyFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SKILL_DIR, "../../..");
const HARNESS = join(SKILL_DIR, "harness");
const FRONTEND = join(REPO, "frontend");
/** The harness sits beside `App.tsx` so the type-check covers it. */
const VITE_ROOT = join(FRONTEND, "src");

/**
 * The window the frame page draws: a 32px title bar over the app's 1200x760
 * client area. Both halves are stated in `harness/__preview.html` too —
 * changing one means changing the other, or the capture clips.
 */
const WINDOW = { width: 1200, height: 792 };

const EDGE = [
	"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((path) => existsSync(path));

/**
 * Text that proves `<App/>` actually mounted, rather than the page being blank
 * or the tree having thrown — a blank render is the right size, is `rgba` and
 * has a transparent corner, so no check on the file itself would notice. It is
 * the app bar's log-out action, which every view carries; deliberately not
 * "VexWave", which is in the page's `<title>` and would match a dead page.
 *
 * Nothing here knows what the preview is *of*. That is the harness's business,
 * and yours to look at.
 */
const MOUNTED = "Log out";

interface Shot {
	/** `playlists@1` → view `playlists`, open `1`, file `playlists-1.png`. */
	name: string;
	view: string;
	open: string | null;
}

function parseShot(arg: string): Shot {
	const [view, open = null] = arg.split("@");
	return { name: open === null ? view : `${view}-${open}`, view, open };
}

// --- arguments -------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) =>
	args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const named = args.filter((a) => !a.startsWith("--"));
const shots = (named.length ? named : ["library"]).map(parseShot);
const outDir = resolve(REPO, flag("out", "preview"));
const scale = Number(flag("scale", "1.5"));
// On by default: the harness is rewritten for every preview, and this is what
// catches state written against a store that has since moved on.
const check = !args.includes("--no-check");
const keep = args.includes("--keep");
/**
 * The now-playing bars animate, so a library render is never byte-identical to
 * the last one. This freezes them — the app honours prefers-reduced-motion — at
 * the cost of the bars becoming four equal blocks, which is why it is not the
 * default. It does not reach Discover's download spinner, which honours nothing.
 */
const still = args.includes("--still");
const expected = {
	width: Math.round(WINDOW.width * scale),
	height: Math.round(WINDOW.height * scale),
};

// --- helpers ---------------------------------------------------------------

async function run(cmd: string[]): Promise<{ ok: boolean; output: string }> {
	const proc = Bun.spawn(cmd, { cwd: FRONTEND, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { ok: code === 0, output: stdout + stderr };
}

/** A port nothing is listening on — vite's config sets `strictPort`. */
async function freePort(from = 5300): Promise<number> {
	for (let port = from; port < from + 50; port++) {
		const taken = await new Promise<boolean>((done) => {
			const socket = connect({ port, host: "127.0.0.1" })
				.on("connect", () => (socket.destroy(), done(true)))
				.on("error", () => (socket.destroy(), done(false)));
		});
		if (!taken) return port;
	}
	throw new Error(`no free port in ${from}..${from + 50}`);
}

async function waitForServer(port: number): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			const res = await fetch(`http://localhost:${port}/src/__preview.html`);
			if (res.ok) return;
		} catch {
			// not listening yet
		}
		await Bun.sleep(200);
	}
	throw new Error(`vite never answered on ${port}`);
}

/**
 * `bunx vite` is a wrapper around the server that actually holds the port, and
 * killing the wrapper on Windows can leave that server listening — so the tree
 * goes, not just the process.
 */
async function stopVite(proc: { pid: number; kill: () => void } | null) {
	if (!proc) return;
	await run(["taskkill", "/PID", String(proc.pid), "/T", "/F"]).catch(() => {});
	proc.kill();
}

/**
 * Format, size and the top-left pixel of a finished PNG. The corner is the one
 * that matters: it is outside the window's 8px radius, so an opaque value there
 * means the transparent backdrop silently stopped working.
 */
async function inspect(file: string) {
	const probe = await run(["ffmpeg", "-hide_banner", "-i", file]);
	const format = /Video: png, (\w+)/.exec(probe.output)?.[1] ?? "?";
	const size = /, (\d+)x(\d+)/.exec(probe.output);
	const corner = Bun.spawn(
		["ffmpeg", "-v", "error", "-i", file, "-vf", "crop=1:1:0:0", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
		{ stdout: "pipe", stderr: "ignore" },
	);
	const rgba = new Uint8Array(await new Response(corner.stdout).arrayBuffer());
	await corner.exited;
	return {
		format,
		width: Number(size?.[1] ?? 0),
		height: Number(size?.[2] ?? 0),
		cornerAlpha: rgba[3] ?? 255,
	};
}

/**
 * The rendered text of a view, read from the *app* page rather than the frame —
 * `--dump-dom` does not descend into an iframe.
 */
async function dumpDom(port: number, query: string, profile: string): Promise<string> {
	const proc = Bun.spawn(
		[
			EDGE!,
			"--headless=new",
			"--disable-gpu",
			`--user-data-dir=${profile}`,
			"--virtual-time-budget=20000",
			"--dump-dom",
			`http://localhost:${port}/src/__preview-app.html?${query}`,
		],
		{ stdout: "pipe", stderr: "ignore" },
	);
	const dom = await new Response(proc.stdout).text();
	await proc.exited;
	return dom;
}

/**
 * Whether the harness still frames the window the app actually opens. Nothing
 * downstream can notice this drift — the previews stay valid-looking, they just
 * stop being a picture of the app — so it is reported rather than enforced.
 */
async function windowDrift(): Promise<string | null> {
	const source = await Bun.file(join(REPO, "main.go")).text();
	const size = /width:\s*(\d+),\s*height:\s*(\d+)/i.exec(source);
	if (!size) return "could not read the window size out of main.go";
	const [, width, height] = size;
	// The app's height includes its frame; the harness draws a 32px title bar
	// over the client area, so a few px of difference is the border, not drift.
	if (Number(width) === WINDOW.width && Math.abs(Number(height) - WINDOW.height) <= 16) {
		return null;
	}
	return `the app window is now ${width}x${height} but the harness frames ${WINDOW.width}x${WINDOW.height} — update WINDOW here and the sizes in harness/__preview.html`;
}

// --- the run ---------------------------------------------------------------

if (!EDGE) {
	throw new Error(
		"Edge not found — it is the only Chromium on this machine (Chrome is not installed).",
	);
}

const scratch = join(FRONTEND, "node_modules/.cache/preview");
await rm(scratch, { recursive: true, force: true });
await mkdir(scratch, { recursive: true });
await mkdir(outDir, { recursive: true });

const harnessFiles = await readdir(HARNESS);
await Promise.all(
	harnessFiles.map((file) => copyFile(join(HARNESS, file), join(VITE_ROOT, file))),
);

let vite: Bun.Subprocess | null = null;
try {
	if (check) {
		process.stdout.write("type-checking the harness… ");
		const tsc = await run(["bunx", "tsc", "--noEmit"]);
		if (!tsc.ok) throw new Error(`the harness does not type-check:\n${tsc.output}`);
		console.log("ok");
	}

	const port = await freePort();
	// stderr inherited rather than piped: an unread pipe eventually blocks the
	// server, and vite's complaints are the only clue when it won't come up.
	vite = Bun.spawn(["bunx", "vite", "--port", String(port)], {
		cwd: FRONTEND,
		stdout: "ignore",
		stderr: "inherit",
	});
	await waitForServer(port);

	// In parallel, each with its own profile: Edge takes a singleton lock on a
	// user-data-dir, so a shared one would serialise them anyway — or worse,
	// hand the second run to the first instance and write no file.
	const results = await Promise.all(
		shots.map(async (shot) => {
			const raw = join(scratch, `${shot.name}.png`);
			const query = `view=${shot.view}${shot.open === null ? "" : `&open=${shot.open}`}`;
			// Started here so the mount check costs no wall clock: it is a second
			// Edge against the app page, since --dump-dom does not descend into
			// the iframe the shot is framed in.
			const domPass = dumpDom(port, query, join(scratch, `dom-${shot.name}`));
			const edge = await run([
				EDGE,
				"--headless=new",
				"--disable-gpu",
				"--hide-scrollbars",
				`--user-data-dir=${join(scratch, `profile-${shot.name}`)}`,
				// The rounded corners come out of the alpha channel instead of
				// being filled in — the whole point of the transparent frame.
				"--default-background-color=00000000",
				`--force-device-scale-factor=${scale}`,
				// CSS px; the scale factor multiplies it into the output size.
				`--window-size=${WINDOW.width},${WINDOW.height}`,
				// A budget, not a sleep: virtual time runs as fast as the page will
				// let it, and the capture happens when the budget is spent. It has
				// to outlast the slowest thing that settles on its own.
				"--virtual-time-budget=20000",
				// Every compositor stage finishes before the frame is taken, rather
				// than whatever had been rasterised when the budget ran out.
				"--run-all-compositor-stages-before-draw",
				...(still ? ["--force-prefers-reduced-motion=reduce"] : []),
				`--screenshot=${raw}`,
				`http://localhost:${port}/src/__preview.html?${query}`,
			]);
			if (!existsSync(raw)) {
				throw new Error(`${shot.name}: Edge wrote no file\n${edge.output}`);
			}

			// Compressed and checked in the scratch dir, and only moved into --out
			// once every shot has passed: a run that fails half way must not leave
			// a stale or broken picture behind under a name that looks current.
			const packed = join(scratch, `packed-${shot.name}.png`);
			// The only optimiser on this machine — there is no ImageMagick, and
			// `convert` on PATH is Windows' FAT tool.
			const zip = await run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-compression_level", "100", packed]);
			if (!zip.ok) throw new Error(`${shot.name}: ffmpeg failed\n${zip.output}`);

			const png = await inspect(packed);
			const dom = await domPass;
			const problems = [
				png.format !== "rgba" && `pixel format is ${png.format}, not rgba`,
				png.cornerAlpha !== 0 && `corner alpha is ${png.cornerAlpha}, not 0 — the backdrop is not transparent`,
				(png.width !== expected.width || png.height !== expected.height) &&
					`size is ${png.width}x${png.height}, expected ${expected.width}x${expected.height}`,
				!dom.includes(MOUNTED) &&
					`the app never rendered — no "${MOUNTED}" in the DOM. A view name the ` +
						`app no longer has, a stub that throws, or a vite error; run with ` +
						`--keep and open /src/__preview-app.html?${query} to see it`,
			].filter(Boolean);
			if (problems.length) throw new Error(`${shot.name}: ${problems.join("; ")}`);

			return { packed, final: join(outDir, `${shot.name}.png`), bytes: Bun.file(packed).size, png };
		}),
	);

	// Every shot passed — publish them together.
	await Promise.all(results.map((r) => copyFile(r.packed, r.final)));

	for (const { final, bytes, png } of results) {
		const kb = (bytes / 1024).toFixed(0).padStart(4);
		console.log(`${kb} KB  ${png.width}x${png.height}  ${final.replace(`${REPO}\\`, "").replace(`${REPO}/`, "")}`);
	}

	const drift = await windowDrift();
	if (drift) console.log(`\n! ${drift}`);

	console.log(`\n${results.length} rendered. Look at them — nothing here knows what they should show.`);
} finally {
	await stopVite(vite);
	if (!keep) {
		await Promise.all(harnessFiles.map((file) => rm(join(VITE_ROOT, file), { force: true })));
	}
}
