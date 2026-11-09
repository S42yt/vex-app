// Loopback audio end to end in WebView2, one checkpointed step at a time:
// progressive start + /head + Web Audio over CORS, seek via Range, track switch (abort), replay from cache.
export default async function ({ page }) {
	let crashed = false;
	page.on("crash", () => { crashed = true; console.log("RENDERER CRASH"); });
	page.on("console", (m) => console.log(`console ${m.type()}: ${m.text()}`));
	await page.waitForTimeout(1500);

	const steps: [string, string][] = [
		["setup", `(async()=>{window.m=await probe.Probe.Media();window.a=new Audio();a.preload="metadata";a.crossOrigin="anonymous";window.t0=performance.now();
			window.h=fetch(m.Head1).then(async r=>{const b=await r.arrayBuffer();const d=await new OfflineAudioContext(1,1,22050).decodeAudioData(b);return {status:r.status,bytes:b.byteLength,decodedSec:Math.round(d.duration),ms:Math.round(performance.now()-t0)}});
			a.src=m.Track1;window.c=new AudioContext();window.an=c.createAnalyser();c.createMediaElementSource(a).connect(an).connect(c.destination);
			window.playingAt=null;a.addEventListener("playing",()=>{playingAt??=Math.round(performance.now()-t0)});
			await a.play();await new Promise(r=>setTimeout(r,300));return {playingAtMs:playingAt,ctx:c.state,sentAtStart:await probe.Probe.BackendSent(),fileSize:m.Size1}})()`],
		["play 1.5s + Web Audio", `(async()=>{await new Promise(r=>setTimeout(r,1500));const buf=new Float32Array(an.fftSize);an.getFloatTimeDomainData(buf);let pk=0;for(const v of buf)pk=Math.max(pk,Math.abs(v));
			return {duration:a.duration,currentTime:a.currentTime,webAudioPeak:pk,head:await h,sent:await probe.Probe.BackendSent()}})()`],
		["seek to 200s", `(async()=>{const s0=await probe.Probe.BackendSent();const t=performance.now();a.currentTime=200;await new Promise(r=>a.addEventListener("seeked",r,{once:true}));const ms=Math.round(performance.now()-t);const at=a.currentTime;
			await new Promise(r=>setTimeout(r,1500));return {seekedMs:ms,at,after1500:a.currentTime,paused:a.paused,sentBefore:s0,sentAfter:await probe.Probe.BackendSent(),
			buffered:[...Array(a.buffered.length)].map((_,i)=>[Math.round(a.buffered.start(i)),Math.round(a.buffered.end(i))])}})()`],
		["seek back to 10s", `(async()=>{a.currentTime=10;await new Promise(r=>a.addEventListener("seeked",r,{once:true}));await new Promise(r=>setTimeout(r,1000));return {currentTime:a.currentTime}})()`],
		["switch to track 2", `(async()=>{a.src=m.Track2;await a.play();await new Promise(r=>setTimeout(r,1500));return {currentTime:a.currentTime}})()`],
		["wait for t1 to finish downloading", `(async()=>{await new Promise(r=>setTimeout(r,20000));return {sent:await probe.Probe.BackendSent()}})()`],
		["replay t1 from cache + seek", `(async()=>{const s0=await probe.Probe.BackendSent();const t=performance.now();a.src=m.Track1;await a.play();a.currentTime=120;await new Promise(r=>a.addEventListener("seeked",r,{once:true}));
			await new Promise(r=>setTimeout(r,1000));return {ms:Math.round(performance.now()-t),currentTime:a.currentTime,backendBytesDuringReplay:(await probe.Probe.BackendSent())-s0}})()`],
	];
	for (const [name, code] of steps) {
		try {
			console.log(`STEP ${name}:`, JSON.stringify(await page.evaluate(code)));
		} catch (e) {
			console.log(`STEP ${name} FAILED (crashed=${crashed}):`, String(e).slice(0, 100));
			return;
		}
	}
	const log = await page.evaluate(`(async()=>({events:await probe.Probe.MediaEvents(),backend:await probe.Probe.BackendLog()}))()`) as any;
	for (const e of log.events) {
		console.log(`proxy ${e.Mode.padEnd(11)} ${e.Path.replace(/^\/[0-9a-f]+/, "")} range=${e.Range || "-"} up=${e.Upstream} toClient=${e.ToClient} drained=${e.Drained} clientGone=${e.ClientGone} upCancelled=${e.UpstreamCancelled} ${Math.round(e.Duration / 1e6)}ms`);
	}
	console.log("backend requests:\n  " + log.backend.join("\n  "));
}
