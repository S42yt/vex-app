// Sets the app version in build/config.yml and in build/windows/info.json, the version
// resource the exe carries and the updater compares. Run: bun scripts/set-version.ts 1.2.3
const CONFIG = "build/config.yml";
const INFO = "build/windows/info.json";
// info.version: the first double-quoted `version:`. The file's own `version: '3'` is single-quoted.
const VERSION_LINE = /^(\s*version:\s*)"[^"]*"/m;

export async function setVersion(version: string): Promise<void> {
	const config = await Bun.file(CONFIG).text();
	if (!VERSION_LINE.test(config)) throw new Error(`No version line found in ${CONFIG}.`);
	await Bun.write(CONFIG, config.replace(VERSION_LINE, `$1"${version}"`));

	const info = await Bun.file(INFO).json();
	info.fixed.file_version = info.fixed.product_version = version;
	for (const lang of Object.values(info.info) as Record<string, string>[]) {
		lang.FileVersion = lang.ProductVersion = version;
	}
	await Bun.write(INFO, JSON.stringify(info, null, "\t"));
}

if (import.meta.main) {
	const version = (process.argv[2] ?? "").replace(/^v/, "");
	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		console.error("usage: bun scripts/set-version.ts MAJOR.MINOR.PATCH");
		process.exit(1);
	}
	await setVersion(version);
}
