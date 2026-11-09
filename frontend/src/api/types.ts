export interface LoginParams {
	baseUrl: string;
	username: string;
	password: string;
	proxyUrl?: string;
}

export type LoginResult = { ok: true; token: string } | RpcFailure;

export interface RestoreSessionParams {
	baseUrl: string;
	token: string;
	proxyUrl?: string;
}

export interface ProxyParams {
	proxyUrl?: string;
}

export interface RpcFailure {
	ok: false;
	status?: number;
	// Retry-After from a 429. The contract requires honouring the wait rather than
	// retrying.
	retryAfterSec?: number;
	error: string;
}

export type RpcResult = { ok: true } | RpcFailure;

// A local file staged by Go for the review dialog, or refused with `error`.
export interface StagedFile {
	id: string;
	fileName: string;
	title: string;
	durationMs: number;
	coverUrl?: string;
	error?: string;
}

export type PickTracksResult = { ok: true; staged: StagedFile[] } | RpcFailure;

export interface ConfirmUploadParams {
	stagedId: string;
	title: string;
	artistIds: number[];
	// Absent keeps the staged cover; null drops it.
	coverBase64?: string | null;
}

export interface DiscardStagedParams {
	ids: string[];
}

export interface RemoteTrack {
	id: string;
	title: string;
	artistIds: number[];
	durationMs: number;
	streamUrl: string;
	coverUrl?: string;
}

export interface DownloadTrackParams {
	id: string;
	fileName: string;
	startingFolder?: string;
}

export type DownloadTrackResult =
	| { ok: true; path: string | null; folder?: string }
	| RpcFailure;

export interface DeleteTrackParams {
	id: string;
}

export interface EditTrackParams {
	id: string;
	title?: string;
	artistIds?: number[];
	coverBase64?: string | null;
}

export interface CreateArtistParams {
	name: string;
	imageBase64?: string;
}

export interface EditArtistParams {
	id: number;
	name?: string;
	imageBase64?: string | null;
}

export interface DeleteArtistParams {
	id: number;
}

export interface RemoteArtist {
	id: number;
	name: string;
	imageUrl?: string;
}

export interface CreatePlaylistParams {
	name: string;
	trackIds?: string[];
	imageBase64?: string;
}

export interface EditPlaylistParams {
	id: number;
	name?: string;
	trackIds?: string[];
	imageBase64?: string | null;
}

export interface DeletePlaylistParams {
	id: number;
}

export interface RemotePlaylist {
	id: number;
	name: string;
	trackIds: string[];
	imageUrl?: string;
}

export interface RemoteLibrary {
	tracks: RemoteTrack[];
	artists: RemoteArtist[];
	playlists: RemotePlaylist[];
}

export type GetLibraryResult = ({ ok: true } & RemoteLibrary) | RpcFailure;

export type BinaryName = "ytDlp" | "ffmpeg" | "deno";

export interface BinaryStatus {
	installed: BinaryName[];
	missing: BinaryName[];
	ytDlpVersion?: string;
}

export type BinaryStatusResult = ({ ok: true } & BinaryStatus) | RpcFailure;

export interface YtDlpUpdateResult {
	ok: true;
	updateAvailable: boolean;
	latestVersion?: string;
	installedVersion?: string;
}

export type BinaryInstallStep = "downloading" | "extracting";

export type BinaryProgressMessage =
	| {
			type: "progress";
			binary: BinaryName;
			step: BinaryInstallStep;
			receivedBytes: number;
			totalBytes?: number;
			part: number;
			partCount: number;
	  }
	| { type: "binaryInstalled"; binary: BinaryName }
	| { type: "finished" }
	| { type: "failed"; binary: BinaryName; error: string };

export interface AppUpdateResult {
	latestVersion: string | null;
}

export type InstallAppUpdateResult =
	| RpcResult
	| (RpcFailure & { downloadMissing: true });

export type AppUpdateProgressMessage =
	| { type: "progress"; receivedBytes: number; totalBytes?: number }
	| { type: "ready" }
	| { type: "failed"; error: string };

export interface ImportFromUrlParams {
	importId: string;
	url: string;
}

export type UrlImportStep =
	| "starting"
	| "downloading"
	| "converting"
	| "staging";

export interface ImportedArtist {
	name: string;
	imageBase64?: string;
	imageMime?: string;
}

export type UrlImportProgressMessage =
	| {
			type: "progress";
			importId: string;
			step: UrlImportStep;
			title?: string;
			receivedBytes?: number;
			totalBytes?: number;
	  }
	| {
			type: "staged";
			importId: string;
			staged: StagedFile;
			artist?: ImportedArtist;
	  }
	| { type: "failed"; importId: string; error: string };

export type SearchSource = "youtube" | "soundcloud";

export interface SearchMediaParams {
	query: string;
	source: SearchSource;
}

export interface MediaSearchResult {
	id: string;
	title: string;
	url: string;
	artist?: string;
	durationSec?: number;
	thumbnailUrl?: string;
}

export type SearchMediaResult =
	| { ok: true; results: MediaSearchResult[] }
	| RpcFailure;

export interface PresenceTrack {
	id: string;
	title: string;
	artist?: string;
	hasCover: boolean;
	positionSec: number;
	durationSec: number;
}

export interface PresenceMessage {
	track: PresenceTrack | null;
}

export interface SetPresenceEnabledParams {
	enabled: boolean;
}

export type PresenceConnection = "offline" | "connected" | "refused";

export interface PresenceRefusal {
	code?: number;
	message?: string;
}

export interface PresenceStatus {
	connection: PresenceConnection;
	refusal?: PresenceRefusal;
}

export interface UninstallTarget {
	removable: boolean;
}
