// Hand-made pages aimed at each place where a literal Go port could diverge.
type S = { title: string; creator: string; durationSec: number | null; topicChannel?: boolean; verified?: boolean };
const page = (query: string, rows: S[]) => ({
	query,
	source: "synthetic",
	hits: rows.map((s, i) => ({ id: `${i}`, signals: { topicChannel: false, verified: false, ...s } })),
});
const d = 200;
export const synthetic = [
	page("opus", [
		{ title: "Opus (Mix)", creator: "A", durationSec: d },
		{ title: "Opus (Original Mix)", creator: "A", durationSec: d },
		{ title: "Opus (Club  Mix)", creator: "A", durationSec: d }, // two spaces: \s matches one
		{ title: "Opus (Radio-Mix)", creator: "A", durationSec: d },
		{ title: "Opus (unoriginal mix)", creator: "A", durationSec: d },
		{ title: "Opus (Extended Mix) - mix", creator: "A", durationSec: d },
		{ title: "Opus (VIP\tMix)", creator: "A", durationSec: d },
		{ title: "Opus Megamix", creator: "A", durationSec: d },
		{ title: "Opus remix", creator: "A", durationSec: d },
	]),
	// Mathematical script letters are outside the BMP: 2 UTF-16 units, 1 rune each.
	page("beyonce", [
		{ title: "𝓑𝓮𝔂𝓸𝓷𝓬𝓮 tribute", creator: "x", durationSec: d },
		{ title: "Beyonce", creator: "y", durationSec: d },
		{ title: "𝓑𝓮𝔂𝓸𝓷", creator: "z", durationSec: d },
		{ title: "beyon", creator: "w", durationSec: d },
	]),
	page("𝓑𝓮𝔂𝓸𝓷", [
		{ title: "𝓑𝓮𝔂𝓸𝓷𝓬𝓮", creator: "x", durationSec: d },
		{ title: "𝓑𝓮𝔂𝓸𝔁", creator: "y", durationSec: d },
		{ title: "other", creator: "z", durationSec: d },
	]),
	// Greek final sigma: JS lowercases Σ at a word end to ς, Go's ToLower always to σ.
	page("λογος", [
		{ title: "ΛΟΓΟΣ (Official Video)", creator: "Band", durationSec: d },
		{ title: "Λογος", creator: "Band", durationSec: d },
		{ title: "ΛΟΓΟΙ", creator: "Band", durationSec: d },
	]),
	page("ΛΟΓΟΣ live", [
		{ title: "λογος live", creator: "Band", durationSec: d },
		{ title: "ΛΟΓΟΣ", creator: "Band", durationSec: d },
	]),
	// Turkish dotted capital I.
	page("istanbul", [
		{ title: "İSTANBUL", creator: "Sezen", durationSec: d },
		{ title: "Istanbul (Not Constantinople)", creator: "TMBG", durationSec: d },
		{ title: "İNTERVIEW istanbul", creator: "TV", durationSec: d },
	]),
	// Devanagari vowel signs are Mc (spacing marks), stripped by \p{M}.
	page("तुम ही हो", [
		{ title: "तुम ही हो (Official)", creator: "Arijit", durationSec: d },
		{ title: "Tum Hi Ho", creator: "Arijit", durationSec: d },
		{ title: "तम ह ह", creator: "x", durationSec: d },
	]),
	// ASCII-only \b: a non-ASCII letter next to "live" is a boundary in both engines.
	page("song", [
		{ title: "Ölive song", creator: "a", durationSec: d },
		{ title: "Café live song", creator: "a", durationSec: d },
		{ title: "song", creator: "a", durationSec: d },
		{ title: "song 2 hours", creator: "a", durationSec: 7200 },
		{ title: "song", creator: "a", durationSec: null },
	]),
	// Exact duplicates: only the index prior separates them, so no ties.
	page("dup", [
		{ title: "dup", creator: "a", durationSec: d },
		{ title: "dup", creator: "a", durationSec: d },
		{ title: "dup", creator: "a", durationSec: d },
	]),
	page("dont stop", [
		{ title: "Don’t Stop", creator: "Queen", durationSec: d },
		{ title: "Don't Stop", creator: "Queen", durationSec: d },
		{ title: "Don`t Stop", creator: "Queen", durationSec: d },
		{ title: "Don´t Stop", creator: "Queen", durationSec: d },
	]),
];
// 3 astral letters = 6 UTF-16 units: JS allows one edit, a rune count allows none.
synthetic.push(page("𝓑𝓮𝔂", [
	{ title: "other words", creator: "x", durationSec: d },
	{ title: "𝓑𝓮𝔁", creator: "y", durationSec: d },
	{ title: "plain", creator: "z", durationSec: d },
]));
