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
	AppUpdate,
	BinaryFailed,
	BinaryInstalled,
	BinaryProgress,
	BinaryStatus,
	ConfirmUploadParams,
	CreateArtistParams,
	CreatePlaylistParams,
	DeleteArtistParams,
	DeletePlaylistParams,
	DeleteTrackParams,
	DownloadTrackParams,
	EditArtistParams,
	EditPlaylistParams,
	EditTrackParams,
	Failure,
	ImportFailed,
	ImportFromUrlParams,
	ImportProgress,
	ImportStaged,
	LoginParams,
	MediaSearchResult,
	NowPlaying,
	NumberedPresenceStatus,
	ProxyParams,
	RemoteLibrary,
	RestoreSessionParams,
	SavedTrack,
	SearchMediaParams,
	SetPresenceEnabledParams,
	StagedFile,
	UninstallTarget,
	YtDlpUpdate,
} from "./types";

interface Backend {
	Session: {
		Login(p: LoginParams): Promise<string>;
		RestoreSession(p: RestoreSessionParams): Promise<void>;
		Logout(): Promise<void>;
		SetProxy(p: ProxyParams): Promise<void>;
	};
	Library: {
		GetLibrary(): Promise<RemoteLibrary>;
		DeleteTrack(p: DeleteTrackParams): Promise<void>;
		EditTrack(p: EditTrackParams): Promise<void>;
		CreateArtist(p: CreateArtistParams): Promise<void>;
		EditArtist(p: EditArtistParams): Promise<void>;
		DeleteArtist(p: DeleteArtistParams): Promise<void>;
		CreatePlaylist(p: CreatePlaylistParams): Promise<void>;
		EditPlaylist(p: EditPlaylistParams): Promise<void>;
		DeletePlaylist(p: DeletePlaylistParams): Promise<void>;
	};
	Upload: {
		Pick(): Promise<StagedFile[]>;
		Confirm(p: ConfirmUploadParams): Promise<void>;
		Discard(ids: string[]): Promise<void>;
	};
	Download: {
		SaveTrack(p: DownloadTrackParams): Promise<SavedTrack>;
	};
	Binaries: {
		GetBinaryStatus(): Promise<BinaryStatus>;
		InstallMissingBinaries(p: ProxyParams): Promise<void>;
		UpdateYtDlp(): Promise<void>;
		CheckYtDlpUpdate(): Promise<YtDlpUpdate>;
	};
	Importer: {
		Start(p: ImportFromUrlParams): Promise<void>;
	};
	Search: {
		Search(p: SearchMediaParams): Promise<MediaSearchResult[]>;
	};
	Presence: {
		SetEnabled(p: SetPresenceEnabledParams): Promise<NumberedPresenceStatus>;
		SetNowPlaying(p: NowPlaying): Promise<void>;
	};
	Update: {
		Check(): Promise<AppUpdate>;
		Download(): Promise<void>;
		Install(): Promise<void>;
	};
	Uninstall: {
		Removable(): Promise<UninstallTarget>;
		Start(): Promise<void>;
	};
}

export const backend = {
	Session,
	Library,
	Upload,
	Download,
	Binaries,
	Importer,
	Search,
	Presence,
	Update,
	Uninstall,
} as unknown as Backend;

export function failureOf(e: unknown): Failure {
	const cause = (e as { cause?: Omit<Failure, "error"> }).cause;
	return {
		error: e instanceof Error ? e.message : String(e),
		status: cause?.status,
		retryAfterSec: cause?.retryAfterSec,
		downloadMissing: cause?.downloadMissing,
	};
}

export const Event = {
	...EventNames,
	UpdateProgress: "wails:updater:download-progress",
	UpdateReady: "wails:updater:update-ready",
	UpdateError: "wails:updater:error",
} as const;

interface EventData {
	[Event.SessionExpired]: { reason: string };
	[Event.BinariesProgress]: BinaryProgress;
	[Event.BinariesInstalled]: BinaryInstalled;
	[Event.BinariesFinished]: Record<string, never>;
	[Event.BinariesFailed]: BinaryFailed;
	[Event.ImportProgress]: ImportProgress;
	[Event.ImportStaged]: ImportStaged;
	[Event.ImportFailed]: ImportFailed;
	[Event.PresenceStatus]: NumberedPresenceStatus;
	[Event.UpdateProgress]: { written: number; total: number };
	[Event.UpdateReady]: unknown;
	[Event.UpdateError]: { stage: string; message: string };
}

export function on<K extends keyof EventData>(
	name: K,
	listener: (data: EventData[K]) => void,
): void {
	Events.On(name, (event) => listener(event.data as EventData[K]));
}
