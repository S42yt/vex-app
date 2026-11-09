import type { RemoteArtist } from "@/api/types";

const DIACRITICS = /[̀-ͯ]/g;

function normalizeArtistName(name: string): string {
	return name
		.normalize("NFKD")
		.replace(DIACRITICS, "")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function editDistance(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	let curr = new Array<number>(b.length + 1);
	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(
				prev[j] + 1,
				curr[j - 1] + 1,
				prev[j - 1] + cost,
			);
		}
		[prev, curr] = [curr, prev];
	}
	return prev[b.length];
}

export function findMatchingArtist(
	name: string,
	artists: readonly RemoteArtist[],
): RemoteArtist | null {
	const target = normalizeArtistName(name);
	if (!target) return null;
	let best: RemoteArtist | null = null;
	let bestDist = Infinity;
	for (const artist of artists) {
		const candidate = normalizeArtistName(artist.name);
		if (!candidate) continue;
		if (candidate === target) return artist;
		const maxLen = Math.max(candidate.length, target.length);
		if (maxLen < 5) continue;
		const dist = editDistance(candidate, target);
		if (dist / maxLen <= 0.15 && dist < bestDist) {
			best = artist;
			bestDist = dist;
		}
	}
	return best;
}
