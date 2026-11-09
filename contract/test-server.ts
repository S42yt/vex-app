import {
	ApiContract,
	CreateArtistRequest,
	CreatePlaylistRequest,
	CreateTrackRequest,
	DeleteByIdRequest,
	DeleteTrackRequest,
	EditArtistRequest,
	EditPlaylistRequest,
	EditTrackRequest,
	MAX_AUDIO_BASE64,
	MAX_IMAGE_BASE64,
	artistImagePath,
	playlistImagePath,
	trackImagePath,
	type RoutePolicy,
} from "./contract";

const PORT = 8790;
const tokens = new Set<string>();

interface StoredTrack {
	id: string;
	title: string;
	duration: number;
	artistIds: number[];
	contentType: string;
	data: Uint8Array;
	cover?: Uint8Array;
}

const tracks = new Map<string, StoredTrack>();

interface StoredArtist {
	id: number;
	name: string;
	image?: Uint8Array;
}

let nextArtistId = 1;
const artists = new Map<number, StoredArtist>();

interface StoredPlaylist {
	id: number;
	name: string;
	trackIds: string[];
	image?: Uint8Array;
}

let nextPlaylistId = 1;
const playlists = new Map<number, StoredPlaylist>();

function unknownTrackIds(trackIds: string[]): string[] {
	return trackIds.filter((id) => !tracks.has(id));
}

function linkable(artistIds: number[]): number[] {
	return [...new Set(artistIds)]
		.filter((id) => artists.has(id))
		.sort((a, b) => a - b);
}

function authorized(req: Request): boolean {
	const auth = req.headers.get("authorization");
	return auth !== null && tokens.has(auth);
}

function sniffAudioType(data: Uint8Array): string {
	const ascii = (start: number, length: number) =>
		String.fromCharCode(...data.subarray(start, start + length));
	if (ascii(0, 3) === "ID3") return "audio/mpeg";
	if (data.length > 1 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0) {
		return "audio/mpeg";
	}
	if (ascii(0, 4) === "fLaC") return "audio/flac";
	if (ascii(0, 4) === "OggS") return "audio/ogg";
	if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "audio/wav";
	if (ascii(4, 4) === "ftyp") return "audio/mp4";
	return "application/octet-stream";
}

function parseRange(
	header: string | null,
	size: number,
): { start: number; end: number } | null | "unsatisfiable" {
	if (!header) return null;
	const match = header.match(/^bytes=(\d*)-(\d*)$/);
	if (!match) return null;
	const [, startRaw, endRaw] = match;
	if (startRaw === "" && endRaw === "") return null;
	if (startRaw === "") {
		const suffix = Number(endRaw);
		if (suffix === 0) return "unsatisfiable";
		return { start: Math.max(size - suffix, 0), end: size - 1 };
	}
	const start = Number(startRaw);
	if (endRaw !== "" && Number(endRaw) < start) return null;
	if (start >= size) return "unsatisfiable";
	return { start, end: endRaw === "" ? size - 1 : Math.min(Number(endRaw), size - 1) };
}


type RouteName = keyof typeof ApiContract;

const ROUTE_BY_PATH = Object.fromEntries(
	Object.entries(ApiContract).map(([name, route]) => [route.path, name]),
) as Record<string, RouteName>;

const BODY_SLACK = 512 * 1024;

const throttleOverride = process.env.LOGIN_THROTTLE?.split(",")
	.map(Number)
	.filter((n) => Number.isFinite(n) && n > 0);

const requestLog = new Map<string, number[]>();

type Handler = (
	req: Request,
	server: Bun.Server<undefined>,
) => Response | Promise<Response>;

function policyOf(path: string): RoutePolicy {
	const name = ROUTE_BY_PATH[path];
	if (!name) throw new Error(`${path} is not a route in the contract`);
	return (ApiContract[name] as { metadata?: RoutePolicy }).metadata ?? {};
}

function withPolicy(policy: RoutePolicy, handler: Handler): Handler {
	const bodyLimit =
		policy.body === "audio"
			? MAX_AUDIO_BASE64 + MAX_IMAGE_BASE64 + BODY_SLACK
			: policy.body === "image"
				? MAX_IMAGE_BASE64 + BODY_SLACK
				: BODY_SLACK;
	const respond: Handler = async (req, server) => {
		const limited = policy.throttle
			? rateLimit(req, server, policy.throttle)
			: null;
		if (limited) return limited;
		if (Number(req.headers.get("content-length") ?? 0) > bodyLimit) {
			console.log(`413 ${new URL(req.url).pathname} (over ${bodyLimit}B)`);
			return new Response("request body too large", { status: 413 });
		}
		return handler(req, server);
	};
	return async (req, server) => {
		const res = await respond(req, server);
		if (res.status !== 304 && !res.headers.has("cache-control")) {
			res.headers.set(
				"cache-control",
				res.ok ? cacheControl(policy.cache) : "no-store",
			);
		}
		return res;
	};
}

function rateLimit(
	req: Request,
	server: Bun.Server<undefined>,
	throttle: NonNullable<RoutePolicy["throttle"]>,
): Response | null {
	const [limit, windowMs] =
		throttleOverride?.length === 2 ? throttleOverride : throttle;
	const { pathname } = new URL(req.url);
	const key = `${pathname}\n${server.requestIP(req)?.address ?? "?"}`;
	const now = Date.now();
	const hits = (requestLog.get(key) ?? []).filter((at) => at > now - windowMs);
	requestLog.set(key, hits);
	if (hits.length >= limit) {
		const retryAfter = Math.ceil((hits[0] + windowMs - now) / 1000);
		console.log(`429 ${pathname}, retry after ${retryAfter}s`);
		return new Response("too many requests", {
			status: 429,
			headers: { "retry-after": String(retryAfter) },
		});
	}
	hits.push(now);
	return null;
}

function cacheControl(cache: RoutePolicy["cache"]): string {
	if (cache === "private-immutable") {
		return "private, max-age=31536000, immutable";
	}
	return "no-store";
}

const imageHashes = new WeakMap<Uint8Array, string>();

function imageHash(bytes: Uint8Array): string {
	const known = imageHashes.get(bytes);
	if (known !== undefined) return known;
	const hash = new Bun.CryptoHasher("md5").update(bytes).digest("hex");
	imageHashes.set(bytes, hash);
	return hash;
}

function etagMatches(header: string | null, etag: string): boolean {
	if (header === null) return false;
	if (header.trim() === "*") return true;
	return header
		.split(",")
		.some((candidate) => candidate.trim().replace(/^W\//, "") === etag);
}

function serveImage(req: Request, bytes: Uint8Array | undefined): Response {
	if (!bytes) return new Response("not found", { status: 404 });
	const hash = imageHash(bytes);
	const etag = `"${hash}"`;
	const headers: Record<string, string> = {
		etag,
		"cache-control":
			new URL(req.url).searchParams.get("v") === hash
				? "public, max-age=31536000, immutable"
				: "public, no-cache",
	};
	if (etagMatches(req.headers.get("if-none-match"), etag)) {
		return new Response(null, { status: 304, headers });
	}
	return new Response(bytes, {
		headers: { ...headers, "content-type": "application/octet-stream" },
	});
}

function withPolicies<T extends Record<string, Record<string, unknown>>>(
	routes: T,
): T {
	return Object.fromEntries(
		Object.entries(routes).map(([path, methods]) => [
			path,
			Object.fromEntries(
				Object.entries(methods as Record<string, Handler>).map(
					([method, handler]) => [method, withPolicy(policyOf(path), handler)],
				),
			),
		]),
	) as T;
}

Bun.serve({
	port: PORT,
	routes: withPolicies({
		"/login": {
			POST: async (req: Request) => {
				const { username, password } = (await req.json()) as {
					username?: string;
					password?: string;
				};
				if (username !== "test" || password !== "test") {
					return new Response("Invalid credentials", { status: 401 });
				}
				const token = crypto.randomUUID();
				tokens.add(token);
				console.log(`login ok, issued token ${token}`);
				return Response.json({ token });
			},
		},
		"/data": {
			GET: (req: Request) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				console.log(
					`data ok: ${tracks.size} tracks, ${artists.size} artists, ` +
						`${playlists.size} playlists`,
				);
				return Response.json({
					tracks: [...tracks.values()].map(
						({ id, title, duration, artistIds, cover }) => ({
							id,
							title,
							duration,
							artistIds,
							coverUrl: cover
								? trackImagePath(id, imageHash(cover))
								: undefined,
						}),
					),
					artists: [...artists.values()].map(({ id, name, image }) => ({
						id,
						name,
						imageUrl: image
							? artistImagePath(id, imageHash(image))
							: undefined,
					})),
					playlists: [...playlists.values()].map(
						({ id, name, trackIds, image }) => ({
							id,
							name,
							trackIds,
							imageUrl: image
								? playlistImagePath(id, imageHash(image))
								: undefined,
						}),
					),
				});
			},
		},
		"/postTrack": {
			POST: async (req: Request) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				const parsed = CreateTrackRequest.safeParse(await req.json());
				if (!parsed.success) {
					return new Response(parsed.error.message, { status: 400 });
				}
				const { title, duration, artistIds, data: audio, cover } = parsed.data;
				const id = crypto.randomUUID();
				const links = linkable(artistIds ?? []);
				tracks.set(id, {
					id,
					title,
					duration,
					artistIds: links,
					contentType: sniffAudioType(audio),
					data: audio,
					cover: cover ? new Uint8Array(cover) : undefined,
				});
				console.log(
					`postTrack ok: #${id} "${title}" duration=${duration}ms ` +
						`audio=${audio.byteLength}B` +
						(cover ? ` cover=${cover.byteLength}B` : "") +
						(links.length ? ` artists=[${links.join(", ")}]` : ""),
				);
				return new Response("ok");
			},
		},
		"/editTrack": {
			POST: async (req: Request) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				const parsed = EditTrackRequest.safeParse(await req.json());
				if (!parsed.success) {
					return new Response(parsed.error.message, { status: 400 });
				}
				const { id, title, artistIds, cover } = parsed.data;
				const track = tracks.get(id);
				if (!track) return new Response("not found", { status: 404 });
				if (title !== undefined) track.title = title;
				if (artistIds !== undefined) track.artistIds = linkable(artistIds);
				if (cover === null) track.cover = undefined;
				else if (cover !== undefined) track.cover = new Uint8Array(cover);
				console.log(
					`editTrack ok: #${id} "${track.title}"` +
						(cover === null
							? " cover=removed"
							: cover !== undefined
								? ` cover=${cover.byteLength}B`
								: ""),
				);
				return new Response("ok");
			},
		},
		"/postArtist": {
			POST: async (req: Request) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				const parsed = CreateArtistRequest.safeParse(await req.json());
				if (!parsed.success) {
					return new Response(parsed.error.message, { status: 400 });
				}
				const { name, image } = parsed.data;
				const id = nextArtistId++;
				artists.set(id, {
					id,
					name,
					image: image ? new Uint8Array(image) : undefined,
				});
				console.log(
					`postArtist ok: #${id} "${name}"` +
						(image ? ` image=${image.byteLength}B` : ""),
				);
				return new Response("ok");
			},
		},
		"/editArtist": {
			POST: async (req: Request) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				const parsed = EditArtistRequest.safeParse(await req.json());
				if (!parsed.success) {
					return new Response(parsed.error.message, { status: 400 });
				}
				const { id, name, image } = parsed.data;
				const artist = artists.get(id);
				if (!artist) return new Response("not found", { status: 404 });
				if (name !== undefined) artist.name = name;
				if (image === null) artist.image = undefined;
				else if (image !== undefined) artist.image = new Uint8Array(image);
				console.log(
					`editArtist ok: #${id} "${artist.name}"` +
						(image === null
							? " image=removed"
							: image !== undefined
								? ` image=${image.byteLength}B`
								: ""),
				);
				return new Response("ok");
			},
		},
		"/deleteTrack": {
			POST: async (req: Request) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				const parsed = DeleteTrackRequest.safeParse(await req.json());
				if (!parsed.success || !tracks.delete(parsed.data.id)) {
					return new Response("not found", { status: 404 });
				}
				for (const playlist of playlists.values()) {
					playlist.trackIds = playlist.trackIds.filter(
						(id) => id !== parsed.data.id,
					);
				}
				console.log(`deleteTrack ok: #${parsed.data.id}`);
				return new Response("ok");
			},
		},
		"/postPlaylist": {
			POST: async (req: Request) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				const parsed = CreatePlaylistRequest.safeParse(await req.json());
				if (!parsed.success) {
					return new Response(parsed.error.message, { status: 400 });
				}
				const { name, trackIds, image } = parsed.data;
				const unknown = unknownTrackIds(trackIds ?? []);
				if (unknown.length > 0) {
					return new Response(`unknown track ids: ${unknown.join(", ")}`, {
						status: 400,
					});
				}
				const id = nextPlaylistId++;
				playlists.set(id, {
					id,
					name,
					trackIds: trackIds ?? [],
					image: image ? new Uint8Array(image) : undefined,
				});
				console.log(
					`postPlaylist ok: #${id} "${name}" tracks=[${(trackIds ?? []).join(", ")}]` +
						(image ? ` image=${image.byteLength}B` : ""),
				);
				return new Response("ok");
			},
		},
		"/editPlaylist": {
			POST: async (req: Request) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				const parsed = EditPlaylistRequest.safeParse(await req.json());
				if (!parsed.success) {
					return new Response(parsed.error.message, { status: 400 });
				}
				const { id, name, trackIds, image } = parsed.data;
				const playlist = playlists.get(id);
				if (!playlist) return new Response("not found", { status: 404 });
				if (trackIds !== undefined) {
					const unknown = unknownTrackIds(trackIds);
					if (unknown.length > 0) {
						return new Response(`unknown track ids: ${unknown.join(", ")}`, {
							status: 400,
						});
					}
					playlist.trackIds = trackIds;
				}
				if (name !== undefined) playlist.name = name;
				if (image === null) playlist.image = undefined;
				else if (image !== undefined) playlist.image = new Uint8Array(image);
				console.log(
					`editPlaylist ok: #${id} "${playlist.name}" ` +
						`tracks=[${playlist.trackIds.join(", ")}]`,
				);
				return new Response("ok");
			},
		},
		"/deletePlaylist": {
			POST: async (req: Request) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				const parsed = DeleteByIdRequest.safeParse(await req.json());
				if (!parsed.success || !playlists.delete(parsed.data.id)) {
					return new Response("not found", { status: 404 });
				}
				console.log(`deletePlaylist ok: #${parsed.data.id}`);
				return new Response("ok");
			},
		},
		[ApiContract.getPlaylistImage.path]: {
			GET: (req: Bun.BunRequest<typeof ApiContract.getPlaylistImage.path>) =>
				serveImage(req, playlists.get(Number(req.params.id))?.image),
		},
		"/deleteArtist": {
			POST: async (req: Request) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				const parsed = DeleteByIdRequest.safeParse(await req.json());
				if (!parsed.success || !artists.delete(parsed.data.id)) {
					return new Response("not found", { status: 404 });
				}
				for (const track of tracks.values()) {
					track.artistIds = track.artistIds.filter(
						(id) => id !== parsed.data.id,
					);
				}
				console.log(`deleteArtist ok: #${parsed.data.id}`);
				return new Response("ok");
			},
		},
		[ApiContract.getArtistImage.path]: {
			GET: (req: Bun.BunRequest<typeof ApiContract.getArtistImage.path>) =>
				serveImage(req, artists.get(Number(req.params.id))?.image),
		},
		[ApiContract.getTrackImage.path]: {
			GET: (req: Bun.BunRequest<typeof ApiContract.getTrackImage.path>) =>
				serveImage(req, tracks.get(req.params.id)?.cover),
		},
		[ApiContract.getTrackAudio.path]: {
			GET: (req: Bun.BunRequest<typeof ApiContract.getTrackAudio.path>) => {
				if (!authorized(req)) {
					return new Response("Invalid or missing token", { status: 401 });
				}
				const track = tracks.get(req.params.id);
				if (!track) return new Response("not found", { status: 404 });
				const size = track.data.byteLength;
				const range = parseRange(req.headers.get("range"), size);
				if (range === "unsatisfiable") {
					return new Response("range not satisfiable", {
						status: 416,
						headers: { "content-range": `bytes */${size}` },
					});
				}
				const baseHeaders = {
					"content-type": track.contentType,
					"accept-ranges": "bytes",
				};
				if (!range) {
					console.log(`stream #${track.id} full ${size}B`);
					return new Response(track.data, { headers: baseHeaders });
				}
				console.log(
					`stream #${track.id} bytes ${range.start}-${range.end}/${size}`,
				);
				return new Response(track.data.subarray(range.start, range.end + 1), {
					status: 206,
					headers: {
						...baseHeaders,
						"content-range": `bytes ${range.start}-${range.end}/${size}`,
					},
				});
			},
		},
	}),
	fetch: () => new Response("not found", { status: 404 }),
});

console.log(`test server listening on http://localhost:${PORT}`);
