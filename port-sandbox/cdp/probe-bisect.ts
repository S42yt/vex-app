export default async function ({ page }) {
	page.on("console", (m) => console.log(`console ${m.type()}: ${m.text()}`));
	page.on("framenavigated", (f) => console.log("navigated", f.url()));
	page.on("crash", () => console.log("RENDERER CRASH"));
	await page.waitForTimeout(1500);
	const steps = [
		`(async()=>{const m=await probe.Probe.Media();window.m=m;return m.Track1.slice(0,40)})()`,
		`(async()=>{const r=await fetch(m.Head1);return r.status+" "+(await r.arrayBuffer()).byteLength})()`,
		`(()=>{window.a=new Audio();a.crossOrigin="anonymous";a.src=m.Track1;return "src set"})()`,
		`(async()=>{try{await a.play();return "playing"}catch(e){return e.name}})()`,
		`(()=>{window.ctx=new AudioContext();return ctx.state})()`,
		`(()=>{ctx.createMediaElementSource(a).connect(ctx.destination);return "graph"})()`,
	];
	for (const s of steps) {
		try {
			console.log("step ->", await page.evaluate(s));
		} catch (e) {
			console.log("step FAILED", s.slice(0, 50), String(e).slice(0, 120));
		}
		await page.waitForTimeout(800);
	}
}
