// Bridge behaviour: origin, call concurrency, cancellation, error shape, events, payload cap, asset-server streaming.
export default async function ({ page }) {
	await page.waitForFunction(() => (window as any).probe);
	const r = await page.evaluate(async () => {
		const { Probe, Events, TypedEvents } = (window as any).probe;
		const out: Record<string, unknown> = { origin: location.origin, dpr: devicePixelRatio };

		const t0 = Date.now();
		const spans = await Promise.all([Probe.Sleep(1000), Probe.Sleep(1000), Probe.Sleep(1000)]);
		out.threeSleeps1s = { wallMs: Date.now() - t0, overlap: spans.every((s: any) => s.Start < spans[0].End) };

		const p = Probe.Wait("cancelled-by-js");
		setTimeout(() => p.cancel(), 300);
		try { await p; out.cancel = "resolved?!"; } catch (e: any) { out.cancel = { name: e?.name, message: String(e?.message ?? e) }; }
		await new Promise((r) => setTimeout(r, 200));
		out.goSawCancel = await Probe.Cancelled();

		for (const status of [429, 0]) {
			try { await Probe.Fail(status); } catch (e: any) {
				out["fail" + status] = { name: e?.name, message: e?.message, cause: e?.cause, keys: Object.keys(e ?? {}) };
			}
		}

		const got: unknown[] = [];
		const off1 = Events.On(TypedEvents.BinariesProgress, (ev: any) => got.push({ name: ev.name, data: ev.data }));
		const off2 = Events.On(TypedEvents.BinariesFailed, (ev: any) => got.push({ name: ev.name, data: ev.data }));
		await Probe.EmitProgress();
		await new Promise((r) => setTimeout(r, 300));
		off1(); off2();
		out.events = got;

		out.track = await Probe.Track();
		out.editAbsent = await Probe.EditTrack({ id: "a" });
		out.editNull = await Probe.EditTrack({ id: "a", coverBase64: null });
		out.editSet = await Probe.EditTrack({ id: "a", coverBase64: "QUJD", title: "T" });

		const MiB = 1024 * 1024;
		const sizes = [1, 48, 63, 64, 65, 75, 100];
		out.payload = {};
		for (const mb of sizes) {
			const s = "x".repeat(mb * MiB - 64);
			const t = Date.now();
			try { (out.payload as any)[mb + "MiB"] = { ok: await Probe.Echo(s), ms: Date.now() - t }; }
			catch (e: any) { (out.payload as any)[mb + "MiB"] = { error: String(e?.message ?? e).slice(0, 160), ms: Date.now() - t }; }
		}
		// 75 MiB of audio as base64, the way UploadService sends it today.
		const b64 = "A".repeat(Math.ceil((75 * MiB) / 3) * 4);
		try { out.upload75MiBAsBase64 = { ok: await Probe.Echo(b64) }; } catch (e: any) { out.upload75MiBAsBase64 = { error: String(e?.message ?? e).slice(0, 160) }; }

		const tBig = Date.now();
		try { const big = await Probe.Big(100 * MiB); out.response100MiB = { ok: big.length, ms: Date.now() - tBig }; }
		catch (e: any) { out.response100MiB = { error: String(e?.message ?? e).slice(0, 160) }; }

		const ts = Date.now();
		const res = await fetch("/slow");
		const reader = res.body!.getReader();
		const first = await reader.read();
		const firstMs = Date.now() - ts;
		while (!(await reader.read()).done);
		out.assetServerStreaming = { firstChunkMs: firstMs, totalMs: Date.now() - ts, firstChunk: new TextDecoder().decode(first.value).slice(0, 30) };

		out.job = await Probe.Job();
		return out;
	});
	console.log(JSON.stringify(r, null, 1));
}
