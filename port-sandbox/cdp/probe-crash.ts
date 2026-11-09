// Which combination of the player's audio steps crashes the WebView2 renderer?
import { launch } from "./harness";

const variants: Record<string, string> = {
	decodeHeadOnly: `(async()=>{const m=await probe.Probe.Media();const b=await (await fetch(m.Head1)).arrayBuffer();const d=await new OfflineAudioContext(1,1,22050).decodeAudioData(b);return d.duration})()`,
	decodeTagged: `(async()=>{const m=await probe.Probe.Media();const b=await (await fetch(m.Track2.replace('/track/t2','/track/t2/head'))).arrayBuffer();const d=await new OfflineAudioContext(1,1,22050).decodeAudioData(b);return d.duration})()`,
	decodeHeadAt44100: `(async()=>{const m=await probe.Probe.Media();const b=await (await fetch(m.Head1)).arrayBuffer();const d=await new OfflineAudioContext(1,1,44100).decodeAudioData(b);return d.duration})()`,
	decodeViaAudioContext: `(async()=>{const m=await probe.Probe.Media();const b=await (await fetch(m.Head1)).arrayBuffer();const d=await new AudioContext().decodeAudioData(b);return d.duration})()`,
	elementGraphOnly: `(async()=>{const m=await probe.Probe.Media();const a=new Audio();a.crossOrigin="anonymous";a.src=m.Track1;const c=new AudioContext();c.createMediaElementSource(a).connect(c.destination);await a.play();await new Promise(r=>setTimeout(r,2000));return a.currentTime})()`,
};

const only = process.argv[2];
for (const [name, code] of Object.entries(variants)) {
	if (only && name !== only) continue;
	const app = await launch("../app/bin/probe.exe");
	let crashed = false;
	app.page.on("crash", () => (crashed = true));
	await app.page.waitForTimeout(1500);
	let result: unknown;
	try {
		result = await app.page.evaluate(code);
	} catch (e) {
		result = String(e).slice(0, 80);
	}
	await app.page.waitForTimeout(500).catch(() => {});
	console.log(`${name.padEnd(22)} crashed=${crashed} result=${JSON.stringify(result)}`);
	await app.kill();
}
