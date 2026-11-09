import type {
	AppUpdateProgressMessage,
	AppUpdateResult,
	BinaryProgressMessage,
	BinaryStatusResult,
	CreateArtistParams,
	CreatePlaylistParams,
	DeleteArtistParams,
	DeletePlaylistParams,
	DeleteTrackParams,
	DiscardImportParams,
	DownloadTrackParams,
	DownloadTrackResult,
	EditArtistParams,
	EditPlaylistParams,
	EditTrackParams,
	GetLibraryResult,
	ImportFromUrlParams,
	InstallAppUpdateResult,
	LoginParams,
	LoginResult,
	PresenceMessage,
	PresenceStatus,
	ProxyParams,
	RestoreSessionParams,
	RpcResult,
	SearchMediaParams,
	SearchMediaResult,
	SetPresenceEnabledParams,
	UninstallTarget,
	UploadTrackParams,
	UrlImportProgressMessage,
	YtDlpUpdateResult,
} from "./types";

type Requests = {
	login(params: LoginParams): Promise<LoginResult>;
	restoreSession(params: RestoreSessionParams): Promise<RpcResult>;
	logout(): Promise<RpcResult>;
	setProxy(params: ProxyParams): Promise<RpcResult>;
	getLibrary(): Promise<GetLibraryResult>;
	uploadTrack(params: UploadTrackParams): Promise<RpcResult>;
	deleteTrack(params: DeleteTrackParams): Promise<RpcResult>;
	downloadTrack(params: DownloadTrackParams): Promise<DownloadTrackResult>;
	editTrack(params: EditTrackParams): Promise<RpcResult>;
	createArtist(params: CreateArtistParams): Promise<RpcResult>;
	editArtist(params: EditArtistParams): Promise<RpcResult>;
	deleteArtist(params: DeleteArtistParams): Promise<RpcResult>;
	createPlaylist(params: CreatePlaylistParams): Promise<RpcResult>;
	editPlaylist(params: EditPlaylistParams): Promise<RpcResult>;
	deletePlaylist(params: DeletePlaylistParams): Promise<RpcResult>;
	getBinaryStatus(): Promise<BinaryStatusResult>;
	installMissingBinaries(params: ProxyParams): Promise<RpcResult>;
	updateYtDlp(): Promise<RpcResult>;
	checkYtDlpUpdate(): Promise<YtDlpUpdateResult>;
	checkAppUpdate(): Promise<AppUpdateResult>;
	downloadAppUpdate(): Promise<RpcResult>;
	installAppUpdate(): Promise<InstallAppUpdateResult>;
	importFromUrl(params: ImportFromUrlParams): Promise<RpcResult>;
	discardImport(params: DiscardImportParams): Promise<RpcResult>;
	searchMedia(params: SearchMediaParams): Promise<SearchMediaResult>;
	setPresenceEnabled(params: SetPresenceEnabledParams): Promise<PresenceStatus>;
	canUninstall(): Promise<UninstallTarget>;
	uninstallApp(): Promise<RpcResult>;
};

type Messages = {
	sessionExpired: { reason: string };
	binaryProgress: BinaryProgressMessage;
	appUpdateProgress: AppUpdateProgressMessage;
	urlImportProgress: UrlImportProgressMessage;
	presenceStatus: PresenceStatus;
};

const notPorted = (name: string) => () =>
	Promise.reject(new Error(`${name} isn't ported yet`));

export const bun = new Proxy({} as Requests, {
	get: (_, name) => notPorted(String(name)),
});

export function onBunMessage<K extends keyof Messages>(
	_name: K,
	_listener: (payload: Messages[K]) => void,
): void {}

export const notifyBun = {
	presenceChanged(_message: PresenceMessage): void {},
};
