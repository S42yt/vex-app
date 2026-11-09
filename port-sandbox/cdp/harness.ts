// Launch a Wails exe with WebView2 remote debugging, attach over CDP, run a probe module.
// usage: bun harness.ts <exe> <probe.ts> [port]
import { chromium, type Page } from "playwright-core";
import { spawn } from "node:child_process";

export async function launch(exe: string, port = 9333, extraEnv: Record<string, string> = {}) {
	const proc = spawn(exe, [], {
		env: { ...process.env, PROBE_CDP_PORT: String(port), PROBE_FIXTURES: Bun.fileURLToPath(new URL("../fixtures/", import.meta.url)), ...extraEnv },
		stdio: ["ignore", "pipe", "pipe"],
	});
	const log: string[] = [];
	proc.stdout!.on("data", (d) => log.push(String(d)));
	proc.stderr!.on("data", (d) => log.push(String(d)));
	let browser;
	for (let i = 0; i < 100; i++) {
		try {
			browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
			break;
		} catch {
			await Bun.sleep(200);
		}
	}
	if (!browser) throw new Error("CDP never came up\n" + log.join(""));
	let page: Page | undefined;
	for (let i = 0; i < 50 && !page; i++) {
		page = browser.contexts().flatMap((c) => c.pages()).find((p) => !p.url().startsWith("devtools"));
		if (!page) await Bun.sleep(200);
	}
	if (!page) throw new Error("no page");
	await page.waitForLoadState("load");
	const kill = async () => {
		await browser!.close().catch(() => {});
		proc.kill();
		await new Promise((r) => proc.once("exit", r));
	};
	return { page, browser, proc, log, kill };
}

if (import.meta.main) {
	const [exe, probe, port] = process.argv.slice(2);
	const mod = await import(Bun.pathToFileURL(probe).href);
	const app = await launch(exe, port ? Number(port) : 9333);
	try {
		await mod.default(app);
	} finally {
		await app.kill();
		if (process.env.SHOWLOG) console.log("--- app log ---\n" + app.log.join(""));
	}
}
