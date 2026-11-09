/**
 * Renders the real `<App/>` against whatever state you put in the DATA section
 * below. Copied into `frontend/src/` by `render.ts` for the length of a run and
 * deleted afterwards, which is why it can import `./App` and use `@/`.
 *
 * **The data below is an example, not a fixture â€” rewrite it for whatever is
 * being previewed.** A long queue, an empty library, an artist with one track,
 * a failed download: all of it is authored here, per preview. Only the wiring at
 * the bottom is meant to survive.
 *
 * Two rules hold the whole thing up, both invisible until they're broken:
 *
 *   - **Every stubbed getSnapshot returns one hoisted constant.**
 *     `useSyncExternalStore` compares by identity, so building the object inside
 *     the arrow is "Maximum update depth exceeded", not a render.
 *   - **Nothing here fires an RPC.** Each service refetches off a session
 *     *change*, and no subscriber is ever notified, so the stubs can be plain
 *     assignments after a static import.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { artistService } from "@/api/ArtistService";
import { binaryService } from "@/api/BinaryService";
import { discoverService } from "@/api/DiscoverService";
import { importService } from "@/api/ImportService";
import { libraryService } from "@/api/LibraryService";
import { navigationService } from "@/api/NavigationService";
import { playlistService } from "@/api/PlaylistService";
import { presenceService } from "@/api/PresenceService";
import { sessionService } from "@/api/SessionService";
import { uninstallService } from "@/api/UninstallService";
import { playerController } from "@/hooks/usePlayer";
import { watchDevicePixelRatio } from "@/lib/devicePixelRatio";
// Each store's own state type, so data written here that no longer matches the
// app is a compile error rather than a wrong picture (render.ts type-checks this
// file while it sits in src/).
import type { ArtistsState } from "@/api/ArtistService";
import type { BinariesState } from "@/api/BinaryService";
import type { DiscoverState } from "@/api/DiscoverService";
import type { ImportJob } from "@/api/ImportService";
import type { LibraryState } from "@/api/LibraryService";
import type { MainViewName } from "@/api/NavigationService";
import type { PlaylistsState } from "@/api/PlaylistService";
import type { PresenceState } from "@/api/PresenceService";
import type { SessionState } from "@/api/SessionService";
import type { UninstallState } from "@/api/UninstallService";
import type { PlayerState, Track } from "@/player/types";
import type {
	MediaSearchResult,
	RemoteArtist,
	RemoteTrack,
} from "@/api/types";
import "./index.css";
import App from "./App";

// ===========================================================================
// ARTWORK â€” data URIs, so a preview needs no network and nothing real or
// copyrighted ends up in a picture. `crossOrigin="anonymous"` on a `data:` URL
// still leaves the canvas `lib/coverFit.ts` reads back untainted.
// ===========================================================================

const svgUrl = (body: string, width: number, height: number) =>
	`data:image/svg+xml;utf8,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`,
	)}`;

const grad = (from: string, to: string) =>
	`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
	`<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
	`</linearGradient></defs>`;

/** A square sleeve: track covers, playlist covers, artist avatars. */
const cover = (from: string, to: string) =>
	svgUrl(`${grad(from, to)}<rect width="256" height="256" fill="url(#g)"/>`, 256, 256);

/**
 * A 16:9 still: a picture reaching both edges, so `coverFit` measures its side
 * bands as picture rather than dead space and the sleeve letterboxes it over a
 * blurred copy of itself.
 */
const still = (from: string, to: string) =>
	svgUrl(
		`${grad(from, to)}<rect width="480" height="270" fill="url(#g)"/>` +
			`<circle cx="330" cy="96" r="58" fill="#ffffff" fill-opacity="0.22"/>` +
			`<path d="M0 186 L120 138 L246 196 L360 150 L480 200 L480 270 L0 270 Z" fill="#000000" fill-opacity="0.42"/>` +
			`<path d="M0 214 L150 174 L300 224 L480 176 L480 270 L0 270 Z" fill="#000000" fill-opacity="0.34"/>`,
		480,
		270,
	);

/**
 * An "art track": a square cover centred in a 16:9 frame with flat bars, which
 * is what `coverFit` crops away so the cover fills the sleeve. Use it beside
 * `still` when a Discover preview should show both fits.
 */
const artTrack = (from: string, to: string) =>
	svgUrl(
		`${grad(from, to)}<rect width="480" height="270" fill="#0c0c0e"/>` +
			`<rect x="105" width="270" height="270" fill="url(#g)"/>`,
		480,
		270,
	);

// ===========================================================================
// DATA â€” rewrite all of this for the preview being asked for. Names are
// fictional on purpose; keep them that way.
// ===========================================================================

const LIBRARY: { title: string; artists: string[]; sec: number; cover: string }[] = [
	{ title: "Static Bloom", artists: ["Nova Halcyon"], sec: 194, cover: cover("#c084fc", "#7c3aed") },
	{ title: "Amber Room", artists: ["Ivo Marlow", "The Paper Tigers"], sec: 205, cover: cover("#fbbf24", "#b45309") },
	{ title: "Long Way North", artists: ["Silvermoth"], sec: 288, cover: cover("#60a5fa", "#1d4ed8") },
	{ title: "Vertigo Sunday", artists: ["Lyra Wen", "Nova Halcyon"], sec: 226, cover: cover("#fb7185", "#9f1239") },
	{ title: "Featherweight", artists: ["The Paper Tigers"], sec: 172, cover: cover("#a3e635", "#4d7c0f") },
	{ title: "Tidal Drift", artists: ["Kite and Ember"], sec: 259, cover: cover("#2dd4bf", "#0f766e") },
	{ title: "Paper Lanterns", artists: ["Lyra Wen"], sec: 218, cover: cover("#fb923c", "#c2410c") },
	{ title: "Neon Arboretum", artists: ["Nova Halcyon"], sec: 302, cover: cover("#818cf8", "#4338ca") },
	{ title: "Slow Cartography", artists: ["Silvermoth", "Nova Halcyon"], sec: 251, cover: cover("#38bdf8", "#0369a1") },
	{ title: "Halfway Signal", artists: ["Ivo Marlow"], sec: 236, cover: cover("#f472b6", "#9d174d") },
	{ title: "Cold Fluorescence", artists: ["Kite and Ember"], sec: 189, cover: cover("#5eead4", "#0f766e") },
	{ title: "Marble Weather", artists: ["The Paper Tigers", "Lyra Wen"], sec: 274, cover: cover("#facc15", "#a16207") },
	{ title: "Undertow Hours", artists: ["Silvermoth"], sec: 205, cover: cover("#93c5fd", "#1e40af") },
	{ title: "Evening Static", artists: ["Nova Halcyon"], sec: 159, cover: cover("#d8b4fe", "#6b21a8") },
];

const ARTISTS: [name: string, avatar: string][] = [
	["Nova Halcyon", cover("#c084fc", "#6d28d9")],
	["Ivo Marlow", cover("#fbbf24", "#92400e")],
	["The Paper Tigers", cover("#a3e635", "#3f6212")],
	["Silvermoth", cover("#60a5fa", "#1e3a8a")],
	["Lyra Wen", cover("#fb7185", "#9f1239")],
	["Kite and Ember", cover("#2dd4bf", "#115e59")],
];

const PLAYLISTS = [
	{ id: 1, name: "Late Drive", trackIds: ["track-1", "track-4"], imageUrl: cover("#a855f7", "#6d28d9") },
	{ id: 2, name: "Deep Work", trackIds: ["track-3", "track-6"], imageUrl: cover("#22d3ee", "#0e7490") },
	{ id: 3, name: "Sunday Morning", trackIds: ["track-2", "track-5"], imageUrl: cover("#fbbf24", "#b45309") },
];

const SEARCH_QUERY = "nova halcyon";

const RESULTS: MediaSearchResult[] = (
	[
		["Nova Halcyon â€” Static Bloom (Official Video)", "Nova Halcyon", 194, still("#c084fc", "#5b21b6")],
		["Static Bloom (Kite and Ember Remix)", "Kite and Ember", 292, artTrack("#2dd4bf", "#0f766e")],
		["Vertigo Sunday â€” live at Fold Sessions", "Fold Sessions", 241, still("#fb7185", "#7f1d1d")],
		["Neon Arboretum (Visualizer)", "Nova Halcyon", 302, still("#818cf8", "#312e81")],
		["Nova Halcyon â€” Nightline, full set", "Nightline Radio", 2480, still("#fbbf24", "#7c2d12")],
		["Neon Arboretum â€” full album", "Nova Halcyon", 2287, artTrack("#f472b6", "#701a75")],
	] as const
).map(([title, artist, durationSec, thumbnailUrl], index) => ({
	id: `youtube-${index + 1}`,
	title,
	url: `https://www.youtube.com/watch?v=preview${index + 1}`,
	artist,
	durationSec,
	thumbnailUrl,
}));

/**
 * A download in flight, so a Discover card shows the spinner, the progress bar
 * and the status line â€” otherwise that state is hover-only and a still frame
 * can't reach it. Set to `null` for a plain grid.
 */
const RUNNING_IMPORT: ImportJob | null = {
	id: "import-1",
	url: RESULTS[3].url,
	title: RESULTS[3].title,
	step: "downloading",
	receivedBytes: 4_100_000,
	totalBytes: 9_800_000,
	error: null,
};

/**
 * Playing, and a short way in: the seek fill ends well clear of the middle,
 * which is the one place an off-centre thumb still met it.
 */
const PLAYING = { index: 0, atSec: 29 } as const;

/**
 * Both limits, twice over, and two bands left flat: where a fader's thumb sits
 * against the ends of the bank, and against the curve, is only readable at the
 * extremes.
 */
const EQUALIZER = {
	enabled: true,
	gains: [12, -12, 0, 5.5, -2.5, 0, 8, -6, 3.5, -12],
};

/** Slowed, driven and wet, so the player bar's effects button reads as engaged. */
const EFFECTS = {
	rate: 0.9,
	preservePitch: false,
	drive: 0.4,
	reverbMix: 0.35,
} as const;

/**
 * Press the player bar's effects button, since nothing draws that panel until it
 * is pressed. It opens over whichever view is being rendered.
 */
const OPEN_EFFECTS = true;

const PRESENCE: PresenceState = {
	enabled: true,
	status: { connection: "connected" },
};

/**
 * An installed copy, so the uninstall row is drawn. The alternative is what a
 * dev build gets, and there the panel draws nothing at all.
 */
const UNINSTALL: UninstallState = {
	removable: true,
	error: null,
	running: false,
};

// ===========================================================================
// WIRING â€” derives the stores from the data above. Edit when a store changes,
// not when a preview does.
// ===========================================================================

// The one place fixture artists get their ids. `ARTISTS_STATE` and every
// track's `artistIds` are both built off this, so the two can't drift apart.
const REMOTE_ARTISTS: RemoteArtist[] = ARTISTS.map(
	([name, imageUrl], index) => ({
		id: index + 1,
		name,
		imageUrl,
	}),
);

const ARTIST_ID_BY_NAME = new Map(
	REMOTE_ARTISTS.map((artist) => [artist.name, artist.id]),
);

/** A name in `LIBRARY` that no `ARTISTS` row answers to is a fixture typo. */
function artistId(name: string): number {
	const id = ARTIST_ID_BY_NAME.get(name);
	if (id === undefined) throw new Error(`no fixture artist named "${name}"`);
	return id;
}

const REMOTES: RemoteTrack[] = LIBRARY.map((entry, index) => ({
	id: `track-${index + 1}`,
	title: entry.title,
	artistIds: entry.artists.map(artistId),
	durationMs: entry.sec * 1000,
	coverUrl: entry.cover,
	streamUrl: "",
}));

const TRACKS: Track[] = REMOTES.map((remote, index) => ({
	id: remote.id,
	title: remote.title,
	// The joined display line LibraryService derives from the ids above.
	artist: LIBRARY[index].artists.join(", "),
	durationSec: remote.durationMs / 1000,
	coverUrl: remote.coverUrl,
	src: "",
}));

const REMOTE_BY_ID = new Map(REMOTES.map((remote) => [remote.id, remote]));
const TRACK_BY_ID = new Map(TRACKS.map((track) => [track.id, track]));

const TRACKS_BY_ARTIST_ID = new Map<number, Track[]>();
TRACKS.forEach((track, index) => {
	for (const id of REMOTES[index].artistIds) {
		const credited = TRACKS_BY_ARTIST_ID.get(id);
		if (credited) credited.push(track);
		else TRACKS_BY_ARTIST_ID.set(id, [track]);
	}
});

const SESSION: SessionState = {
	status: "loggedIn",
	error: null,
	lastServerUrl: "",
	proxyUrl: "",
	proxyError: null,
	savingProxy: false,
	proxyRetryAfter: null,
	restoring: false,
	retryAfter: null,
};

const BINARIES: BinariesState = {
	phase: "ready",
	missing: [],
	progress: {},
	error: null,
	updateAvailable: false,
	latestVersion: null,
	updating: false,
	updateProgress: null,
	updateError: null,
	updateDismissed: false,
};

const LIBRARY_STATE: LibraryState = { tracks: TRACKS, loading: false, error: null };

const PLAYLISTS_STATE: PlaylistsState = {
	playlists: PLAYLISTS,
	loading: false,
	error: null,
};

const ARTISTS_STATE: ArtistsState = {
	artists: REMOTE_ARTISTS,
	loading: false,
	error: null,
};

const DISCOVER_STATE: DiscoverState = {
	source: "youtube",
	query: SEARCH_QUERY,
	results: RESULTS,
	loading: false,
	error: null,
};

const CURRENT = TRACKS[PLAYING.index] ?? null;

const PLAYER_STATE: PlayerState = {
	queueContextId: "library",
	tracks: TRACKS,
	currentTrack: CURRENT,
	currentIndex: CURRENT ? PLAYING.index : -1,
	isPlaying: CURRENT !== null,
	currentTimeSec: PLAYING.atSec,
	durationSec: CURRENT?.durationSec ?? 0,
	volume: 0.8,
	muted: false,
	repeatMode: "off",
	shuffled: false,
	error: null,
};

sessionService.getSnapshot = () => SESSION;
binaryService.getSnapshot = () => BINARIES;
libraryService.getSnapshot = () => LIBRARY_STATE;
libraryService.getRemote = (id: string) => REMOTE_BY_ID.get(id);
// The indices the playlist and artist views project the library through. They
// are built in `LibraryService.apply` off a real payload, so a stubbed snapshot
// leaves them empty and both views render as though nothing were credited.
libraryService.getTrack = (id: string) => TRACK_BY_ID.get(id);
libraryService.tracksByIds = (trackIds: readonly string[]) =>
	trackIds.flatMap((id) => TRACK_BY_ID.get(id) ?? []);
libraryService.tracksOfArtist = (artistId: number) =>
	TRACKS_BY_ARTIST_ID.get(artistId) ?? [];
playlistService.getSnapshot = () => PLAYLISTS_STATE;
artistService.getSnapshot = () => ARTISTS_STATE;
discoverService.getSnapshot = () => DISCOVER_STATE;
playerController.getSnapshot = () => PLAYER_STATE;
presenceService.getSnapshot = () => PRESENCE;
uninstallService.getSnapshot = () => UNINSTALL;
// The one store the app fills on mount rather than on a session change, so its
// fetch is stubbed out as well as its state.
uninstallService.check = async () => {};
importService.jobFor = (url: string) =>
	RUNNING_IMPORT && url === RUNNING_IMPORT.url ? RUNNING_IMPORT : null;

playerController.equalizer.restore(EQUALIZER);
// Through the setters, because `Effects` is session-only and so has no `restore`
// for stored settings to come back through the way the equalizer's does.
playerController.effects.setRate(EFFECTS.rate);
playerController.effects.setPreservePitch(EFFECTS.preservePitch);
playerController.effects.setDrive(EFFECTS.drive);
playerController.effects.setReverbMix(EFFECTS.reverbMix);

// Where to land: ?view=<MainViewName>[&open=<id>].
const params = new URLSearchParams(location.search);
const view = (params.get("view") ?? "library") as MainViewName;
const open = params.get("open");

if (open !== null && view === "playlists") {
	navigationService.openPlaylist(Number(open));
} else if (open !== null && view === "artists") {
	navigationService.openArtist(Number(open));
} else {
	navigationService.show(view);
}

// Ahead of the first render: the stylesheet's `--dpr: 1` fallback would draw one
// frame of an off-grid now-playing ring, and the capture can land on it.
watchDevicePixelRatio();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);

// The uninstall panel is last in the settings column, so below the fold: run
// the scroller to its end once the panels have laid out. Virtual time makes the
// wait free.
setTimeout(() => {
	// Settings only: every view scrolls through one of these, and a list scrolled
	// to its end is a picture of its last row rather than of the view.
	if (view === "settings") {
		document
			.querySelectorAll("[data-radix-scroll-area-viewport]")
			.forEach((viewport) => {
				viewport.scrollTop = viewport.scrollHeight;
			});
	}
	if (OPEN_EFFECTS) {
		document
			.querySelector<HTMLButtonElement>('[aria-label="Playback effects"]')
			?.click();
	}
}, 400);



