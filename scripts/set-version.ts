const CONFIG = "build/config.yml";
const INFO = "build/windows/info.json";
const MANIFEST = "build/windows/wails.exe.manifest";
const NSIS_TOOLS = "build/windows/nsis/wails_tools.nsh";
const NFPM = "build/linux/nfpm/nfpm.yaml";
export const VERSION_FILES = [CONFIG, INFO, MANIFEST, NSIS_TOOLS, NFPM];
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

	await replaceOnce(MANIFEST, /(<assemblyIdentity [^>]*\bversion=")[^"]*"/, `$1${version}"`);
	await replaceOnce(NSIS_TOOLS, /(!define INFO_PRODUCTVERSION ")[^"]*"/, `$1${version}"`);
	await replaceOnce(NFPM, /^(version: )"[^"]*"/m, `$1"${version}"`);
}

async function replaceOnce(path: string, pattern: RegExp, replacement: string): Promise<void> {
	const text = await Bun.file(path).text();
	if (!pattern.test(text)) throw new Error(`No version found in ${path}.`);
	await Bun.write(path, text.replace(pattern, replacement));
}

if (import.meta.main) {
	const version = (process.argv[2] ?? "").replace(/^v/, "");
	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		console.error("usage: bun scripts/set-version.ts MAJOR.MINOR.PATCH");
		process.exit(1);
	}
	await setVersion(version);
}
