export function watchDevicePixelRatio() {
	let query: MediaQueryList | null = null;
	let published: number | null = null;

	const publish = () => {
		const dpr = window.devicePixelRatio || 1;
		if (dpr === published) return;
		published = dpr;
		document.documentElement.style.setProperty("--dpr", String(dpr));

		query?.removeEventListener("change", publish);
		query = window.matchMedia(`(resolution: ${dpr}dppx)`);
		query.addEventListener("change", publish);
	};

	publish();
}
