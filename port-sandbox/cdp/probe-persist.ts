// Does localStorage (where SessionService keeps the login) survive restarts in WebView2?
// Cases: graceful quit (app.Quit), hard kill right after the write, and a custom WebviewUserDataPath.
import { launch } from "./harness";
import { existsSync } from "node:fs";

async function session(env: Record<string, string>, fn: (page: any) => Promise<unknown>, end: "quit" | "kill") {
	const app = await launch("../app/bin/probe.exe", 9333, env);
	await app.page.waitForTimeout(1500);
	const r = await fn(app.page);
	if (end === "quit") {
		await app.page.evaluate(`probe.Probe.Quit()`).catch(() => {});
		await new Promise((res) => app.proc.once("exit", res));
		await app.browser.close().catch(() => {});
	} else {
		app.proc.kill("SIGKILL"); // TerminateProcess
		await new Promise((res) => app.proc.once("exit", res));
		await app.browser.close().catch(() => {});
		await Bun.sleep(1500); // let WebView2's browser process go
	}
	return r;
}

const custom = `${process.env.LOCALAPPDATA}\\VexWaveProbe\\webview`;
for (const [name, env, end, delay] of [
	["default path, graceful quit", {}, "quit", 0],
	["default path, hard kill 200 ms after write", {}, "kill", 200],
	["default path, hard kill 3 s after write", {}, "kill", 3000],
	["custom WebviewUserDataPath, graceful quit", { PROBE_UDP: custom }, "quit", 0],
] as const) {
	const value = `token-${Date.now()}`;
	await session(env, async (page) => {
		await page.evaluate(`localStorage.setItem("vexwave.session", ${JSON.stringify(value)})`);
		await page.waitForTimeout(delay);
	}, end);
	const read = await session(env, (page) => page.evaluate(`localStorage.getItem("vexwave.session")`), "quit");
	console.log(`${name.padEnd(44)} persisted=${read === value}`);
}
console.log("default profile dir exists:", existsSync(`${process.env.APPDATA}\\probe.exe\\EBWebView`));
console.log("custom profile dir exists:", existsSync(`${custom}\\EBWebView`));
