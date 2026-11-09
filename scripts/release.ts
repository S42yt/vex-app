// Cuts a release: picks the next version, points a tag at main's current commit
// and pushes it. Pushing that tag is the only thing that builds stable, so this
// script is the whole release procedure. Run: bun scripts/release.ts
import { $ } from "bun";
import { setVersion } from "./set-version";

const CONFIG = "build/config.yml";
const INFO = "build/windows/info.json";
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

function fail(message: string): never {
	console.error(`\n  ${message}\n`);
	process.exit(1);
}

const run = (cmd: ReturnType<typeof $>) => cmd.quiet().text();

const branch = (await run($`git rev-parse --abbrev-ref HEAD`)).trim();
if (branch !== "main") {
	fail(`On ${branch}. Releases are cut from main.`);
}

if ((await run($`git status --porcelain`)).trim()) {
	fail("Working tree is dirty. Commit or stash before releasing.");
}

await $`git fetch --quiet origin --tags`.quiet();

// A tag on a commit origin has never seen points at nothing anyone can fetch,
// so the release has to be reachable before it is named.
const [ahead, behind] = (
	await run($`git rev-list --left-right --count main...origin/main`)
)
	.trim()
	.split(/\s+/)
	.map(Number);
if (behind) {
	fail(`main is ${behind} commit(s) behind origin/main. Pull first.`);
}

const tags = (await run($`git tag --list --sort=-v:refname`))
	.split("\n")
	.map((tag) => tag.trim())
	.filter((tag) => SEMVER.test(tag));

const latest = tags[0];
const [major, minor, patch] = latest
	? latest.match(SEMVER)!.slice(1, 4).map(Number)
	: [0, 0, 0];

const bumps = {
	patch: `${major}.${minor}.${patch! + 1}`,
	minor: `${major}.${minor! + 1}.0`,
	major: `${major! + 1}.0.0`,
};
const recommended = latest ? bumps.patch : "0.1.0";

const configText = await Bun.file(CONFIG).text();
const configVersion =
	configText.match(/^\s*version:\s*"([^"]*)"/m)?.[1] ??
	fail(`No version line found in ${CONFIG}.`);

const head = (await run($`git rev-parse --short HEAD`)).trim();
const subject = (await run($`git log -1 --format=%s`)).trim();

console.log(`\n  main       ${head}  ${subject}`);
console.log(`  config     ${configVersion}`);
console.log(`  latest tag ${latest ?? "none"}\n`);
if (latest) {
	console.log(`    patch  ${bumps.patch}   (recommended)`);
	console.log(`    minor  ${bumps.minor}`);
	console.log(`    major  ${bumps.major}\n`);
}

const answer = prompt(`  Next version [${recommended}]:`) ?? "";
const version = (answer.trim() || recommended).replace(/^v/, "");
if (!SEMVER.test(version)) {
	fail(`"${version}" is not a version of the form MAJOR.MINOR.PATCH.`);
}

const tag = `v${version}`;
if (tags.includes(tag)) {
	fail(`${tag} already exists. Releasing over a tag rewrites what it means.`);
}

const bumpsConfig = configVersion !== version;

console.log(`\n  This will:`);
if (bumpsConfig) {
	console.log(`    - set ${CONFIG} and ${INFO} to ${version} and commit them`);
}
if (ahead || bumpsConfig) {
	console.log(`    - push main to origin`);
}
console.log(`    - tag ${tag} and push it, which builds and publishes a release`);

// Declining is an answer, not a failure — exit clean so the shell doesn't
// report an error for someone who simply changed their mind.
if ((prompt(`\n  Release ${tag}? [y/N]:`) ?? "").trim().toLowerCase() !== "y") {
	console.log("\n  Nothing was pushed.\n");
	process.exit(0);
}

if (bumpsConfig) {
	await setVersion(version);
	await $`git add ${CONFIG} ${INFO}`.quiet();
	await $`git commit -m ${`Set the version to ${version}`}`.quiet();
	console.log(`\n  Committed the version bump.`);
}

await $`git push origin main`.quiet();
await $`git tag -a ${tag} -m ${`VexWave ${version}`}`.quiet();
await $`git push origin ${tag}`.quiet();

const remote = (await run($`git remote get-url origin`))
	.trim()
	.replace(/\.git$/, "");
console.log(`  Pushed ${tag}.\n`);
console.log(`  Build:   ${remote}/actions`);
console.log(`  Release: ${remote}/releases/tag/${tag}\n`);
