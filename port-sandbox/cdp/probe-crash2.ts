import { launch } from "./harness";
const pre = `const m=await probe.Probe.Media();const a=new Audio();a.preload="metadata";a.crossOrigin="anonymous";`;
const graph = `const c=new AudioContext();const an=c.createAnalyser();c.createMediaElementSource(a).connect(an).connect(c.destination);`;
const head = `const h=fetch(m.Head1).then(r=>r.arrayBuffer()).then(b=>new OfflineAudioContext(1,1,22050).decodeAudioData(b)).then(d=>d.duration);`;
const play = `await a.play();await new Promise(r=>setTimeout(r,2500));`;
const read = `const buf=new Float32Array(an.fftSize);an.getFloatTimeDomainData(buf);let pk=0;for(const v of buf)pk=Math.max(pk,Math.abs(v));`;
const variants: Record<string, string> = {
	graphBeforeSrc_noHead: `(async()=>{${pre}${graph}a.src=m.Track1;${play}${read}return [a.currentTime,pk]})()`,
	srcThenGraph_noHead: `(async()=>{${pre}a.src=m.Track1;${graph}${play}${read}return [a.currentTime,pk]})()`,
	srcThenGraph_head: `(async()=>{${pre}${head}a.src=m.Track1;${graph}${play}${read}return [a.currentTime,pk,await h]})()`,
	headAfterPlay: `(async()=>{${pre}a.src=m.Track1;${graph}${play}${head}${read}return [a.currentTime,pk,await h]})()`,
};
for (const [name, code] of Object.entries(variants)) {
	const app = await launch("../app/bin/probe.exe");
	let crashed = false;
	app.page.on("crash", () => (crashed = true));
	await app.page.waitForTimeout(1500);
	let result: unknown;
	try { result = await app.page.evaluate(code); } catch (e) { result = String(e).slice(0, 80); }
	await app.page.waitForTimeout(500).catch(() => {});
	console.log(`${name.padEnd(24)} crashed=${crashed} result=${JSON.stringify(result)}`);
	await app.kill();
}
