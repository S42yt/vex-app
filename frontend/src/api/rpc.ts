import { Events } from "@wailsio/runtime";
import * as EventNames from "../../bindings/events";
import * as Binaries from "../../bindings/github.com/VexWave/vex-app/internal/binaries/binaryservice";
import * as Download from "../../bindings/github.com/VexWave/vex-app/internal/download/downloadservice";
import * as Importer from "../../bindings/github.com/VexWave/vex-app/internal/importer/importservice";
import * as Library from "../../bindings/github.com/VexWave/vex-app/internal/library/libraryservice";
import * as Presence from "../../bindings/github.com/VexWave/vex-app/internal/presence/presenceservice";
import * as Search from "../../bindings/github.com/VexWave/vex-app/internal/search/searchservice";
import * as Session from "../../bindings/github.com/VexWave/vex-app/internal/session/sessionservice";
import * as Uninstall from "../../bindings/github.com/VexWave/vex-app/internal/uninstall/uninstallservice";
import * as Update from "../../bindings/github.com/VexWave/vex-app/internal/update/updateservice";
import * as Upload from "../../bindings/github.com/VexWave/vex-app/internal/upload/uploadservice";
import type {
	AppUpdateProgressMessage,
	AppUpdateResult,
	BinaryProgressMessage,
	BinaryStatus,
	BinaryStatusResult,
	ConfirmUploadParams,
	CreateArtistParams,
	CreatePlaylistParams,
	DeleteArtistParams,
	DeletePlaylistParams,
	DeleteTrackParams,
	DiscardStagedParams,
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
	MediaSearchResult,
	PickTracksResult,
	PresenceMessage,
	PresenceStatus,
	ProxyParams,
	RemoteLibrary,
	RestoreSessionParams,
	RpcFailure,
	RpcResult,
	SearchMediaParams,
	SearchMediaResult,
	SetPresenceEnabledParams,
	StagedFile,
	UninstallTarget,
	UrlImportProgressMessage,
	YtDlpUpdateResult,
} from "./types";

type Requests = {
	login(params: LoginParams): Promise<LoginResult>;
	restoreSession(params: RestoreSessionParams): Promise<RpcResult>;
	logout(): Promise<RpcResult>;
	setProxy(params: ProxyParams): Promise<RpcResult>;
	getLibrary(): Promise<GetLibraryResult>;
	pickTracks(): Promise<PickTracksResult>;
	confirmUpload(params: ConfirmUploadParams): Promise<RpcResult>;
	discardStaged(params: DiscardStagedParams): Promise<RpcResult>;
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

// A status event can overtake the reply to an earlier setPresenceEnabled; Go numbers both,
// so neither path can roll the status back.
let presence: PresenceStatus & { seq: number } = { connection: "offline", seq: -1 };
function newestPresence(s: PresenceStatus & { seq: number }): PresenceStatus {
	if (s.seq > presence.seq) presence = s;
	return presence;
}

// A Go error rejects with its JSON in `cause` (backend.Failure: status, retryAfterSec, error).
function failure(e: unknown): RpcFailure {
	const cause = (e as { cause?: { status?: number; retryAfterSec?: number } })
		.cause;
	return {
		ok: false,
		status: cause?.status,
		retryAfterSec: cause?.retryAfterSec,
		error: e instanceof Error ? e.message : String(e),
	};
}

function settle(call: Promise<unknown>): Promise<RpcResult>;
function settle<T, R extends object>(
	call: Promise<T>,
	wrap: (value: T) => R,
): Promise<({ ok: true } & R) | RpcFailure>;
function settle(
	call: Promise<unknown>,
	wrap: (value: unknown) => object = () => ({}),
): Promise<unknown> {
	return call.then((value) => ({ ok: true, ...wrap(value) }), failure);
}

export const bun: Requests = {
	login: (p) => settle(Session.Login(p), (token) => ({ token })),
	restoreSession: (p) => settle(Session.RestoreSession(p)),
	logout: () => settle(Session.Logout()),
	setProxy: (p) => settle(Session.SetProxy(p)),
	getLibrary: () =>
		settle(Library.GetLibrary(), (lib) => lib as unknown as RemoteLibrary),
	pickTracks: () =>
		settle(Upload.Pick(), (staged) => ({ staged: staged as StagedFile[] })),
	confirmUpload: (p) => settle(Upload.Confirm(p)),
	discardStaged: (p) => settle(Upload.Discard(p.ids)),
	downloadTrack: (p) =>
		settle(Download.SaveTrack(p), (r) => ({
			path: r.path ?? null,
			folder: r.folder,
		})),
	deleteTrack: (p) => settle(Library.DeleteTrack(p)),
	editTrack: (p) => settle(Library.EditTrack(p)),
	createArtist: (p) => settle(Library.CreateArtist(p)),
	editArtist: (p) => settle(Library.EditArtist(p)),
	deleteArtist: (p) => settle(Library.DeleteArtist(p)),
	createPlaylist: (p) => settle(Library.CreatePlaylist(p)),
	editPlaylist: (p) => settle(Library.EditPlaylist(p)),
	deletePlaylist: (p) => settle(Library.DeletePlaylist(p)),
	getBinaryStatus: () =>
		settle(Binaries.GetBinaryStatus(), (st) => st as BinaryStatus),
	installMissingBinaries: (p) => settle(Binaries.InstallMissingBinaries(p)),
	updateYtDlp: () => settle(Binaries.UpdateYtDlp()),
	importFromUrl: (p) => settle(Importer.Start(p)),
	searchMedia: (p) =>
		settle(Search.Search(p), (results) => ({
			results: results as MediaSearchResult[],
		})),
	setPresenceEnabled: (p) =>
		Presence.SetEnabled(p).then((s) =>
			newestPresence(s as PresenceStatus & { seq: number }),
		),
	checkYtDlpUpdate: () =>
		Binaries.CheckYtDlpUpdate().then((r) => ({ ok: true as const, ...r })),
	checkAppUpdate: () =>
		Update.Check().then((r) => ({ latestVersion: r.latestVersion || null })),
	downloadAppUpdate: () => settle(Update.Download()),
	installAppUpdate: () =>
		Update.Install().then(
			() => ({ ok: true as const }),
			(e) =>
				(e as { cause?: { downloadMissing?: boolean } }).cause?.downloadMissing
					? { ...failure(e), downloadMissing: true as const }
					: failure(e),
		),
	canUninstall: () => Uninstall.Removable(),
	uninstallApp: () => settle(Uninstall.Start()),
};

// Each pushed message is fed by one Go event per variant; wrap restores its `type`, or drops the event.
const pushed: {
	[K in keyof Messages]?: {
		event: string;
		wrap?: (data: any) => Messages[K] | undefined;
	}[];
} = {
	sessionExpired: [{ event: EventNames.SessionExpired }],
	binaryProgress: [
		{ event: EventNames.BinariesProgress, wrap: (d) => ({ type: "progress", ...d }) },
		{ event: EventNames.BinariesInstalled, wrap: (d) => ({ type: "binaryInstalled", ...d }) },
		{ event: EventNames.BinariesFinished, wrap: () => ({ type: "finished" }) },
		{ event: EventNames.BinariesFailed, wrap: (d) => ({ type: "failed", ...d }) },
	],
	// Wails' updater emits these itself (wails:v3/pkg/updater/events.go).
	appUpdateProgress: [
		{
			event: "wails:updater:download-progress",
			wrap: (d) => ({
				type: "progress",
				receivedBytes: d.written,
				totalBytes: d.total > 0 ? d.total : undefined,
			}),
		},
		{ event: "wails:updater:update-ready", wrap: () => ({ type: "ready" }) },
		{
			event: "wails:updater:error",
			wrap: (d) =>
				d.stage === "check" ? undefined : { type: "failed", error: d.message },
		},
	],
	presenceStatus: [{ event: EventNames.PresenceStatus, wrap: newestPresence }],
	urlImportProgress: [
		{ event: EventNames.ImportProgress, wrap: (d) => ({ type: "progress", ...d }) },
		{ event: EventNames.ImportStaged, wrap: (d) => ({ type: "staged", ...d }) },
		{ event: EventNames.ImportFailed, wrap: (d) => ({ type: "failed", ...d }) },
	],
};

export function onBunMessage<K extends keyof Messages>(
	name: K,
	listener: (payload: Messages[K]) => void,
): void {
	for (const { event, wrap } of pushed[name] ?? []) {
		Events.On(event, (e) => {
			const message = wrap ? wrap(e.data) : e.data;
			if (message !== undefined) listener(message);
		});
	}
}

export const notifyBun = {
	presenceChanged(message: PresenceMessage): void {
		void Presence.SetNowPlaying(message).catch(() => {});
	},
};
