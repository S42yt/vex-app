export interface LoginParams {
	baseUrl: string;
	username: string;
	password: string;
	proxyUrl?: string;
}

export interface RestoreSessionParams {
	baseUrl: string;
	token: string;
	proxyUrl?: string;
}

export interface ProxyParams {
	proxyUrl?: string;
}

export interface Failure {
	error: string;
	status?: number;
	retryAfterSec?: number;
	downloadMissing?: boolean;
}

export interface StagedFile {
	id: string;
	fileName: string;
	title: string;
	durationMs: number;
	coverUrl?: string;
	error?: string;
}

export interface ConfirmUploadParams {
	stagedId: string;
	title: string;
	artistIds: number[];
	coverBase64?: string | null;
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

export interface SavedTrack {
	path?: string;
	folder?: string;
}

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

export type BinaryName = "ytDlp" | "ffmpeg" | "deno";

export interface BinaryStatus {
	installed: BinaryName[];
	missing: BinaryName[];
	ytDlpVersion?: string;
}

export interface YtDlpUpdate {
	updateAvailable: boolean;
	latestVersion?: string;
	installedVersion?: string;
}

export type BinaryInstallStep = "downloading" | "extracting";

export interface BinaryProgress {
	binary: BinaryName;
	step: BinaryInstallStep;
	receivedBytes: number;
	totalBytes?: number;
	part: number;
	partCount: number;
}

export interface BinaryInstalled {
	binary: BinaryName;
}

export interface BinaryFailed {
	binary: BinaryName;
	error: string;
}

export interface AppUpdate {
	latestVersion?: string;
}

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

export interface ImportProgress {
	importId: string;
	step: UrlImportStep;
	title?: string;
	receivedBytes?: number;
	totalBytes?: number;
}

export interface ImportStaged {
	importId: string;
	staged: StagedFile;
	artist?: ImportedArtist;
}

export interface ImportFailed {
	importId: string;
	error: string;
}

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

export interface PresenceTrack {
	id: string;
	title: string;
	artist?: string;
	hasCover: boolean;
	positionSec: number;
	durationSec: number;
}

export interface NowPlaying {
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

export type NumberedPresenceStatus = PresenceStatus & { seq: number };

export interface UninstallTarget {
	removable: boolean;
}
