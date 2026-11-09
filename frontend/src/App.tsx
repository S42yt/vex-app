import type { ComponentType } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AppUpdateBanner } from "@/components/AppUpdateBanner";
import { ArtistsView } from "@/components/ArtistsView";
import { BinarySetupScreen } from "@/components/BinarySetupScreen";
import { DiscoverView } from "@/components/DiscoverView";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LoginScreen } from "@/components/LoginScreen";
import { Logo } from "@/components/Logo";
import { NoticeBanner } from "@/components/NoticeBanner";
import { PlayerBar } from "@/components/PlayerBar";
import { PlaylistsView } from "@/components/PlaylistsView";
import { SECTIONS } from "@/components/Sections";
import { SettingsView } from "@/components/SettingsView";
import { TrackList } from "@/components/TrackList";
import { UploadReviewDialog } from "@/components/UploadReviewDialog";
import { YtDlpUpdateBanner } from "@/components/YtDlpUpdateBanner";
import { useBinaries } from "@/hooks/useBinaries";
import { useDownloads } from "@/hooks/useDownloads";
import { useLibrary } from "@/hooks/useLibrary";
import { useNavigation } from "@/hooks/useNavigation";
import { usePlayer } from "@/hooks/usePlayer";
import { useSession } from "@/hooks/useSession";
import type { MainViewName } from "@/api/NavigationService";

const VIEWS: Record<MainViewName, ComponentType> = {
	library: TrackList,
	discover: DiscoverView,
	playlists: PlaylistsView,
	artists: ArtistsView,
	settings: SettingsView,
};

function App() {
	const { state } = usePlayer();
	const { session } = useSession();
	const { binaries } = useBinaries();
	const { library } = useLibrary();
	const downloads = useDownloads();
	const { view, section } = useNavigation();
	const MainViewComponent = VIEWS[view.name];
	const { Aside } = SECTIONS[section];
	if (binaries.phase !== "ready") return <BinarySetupScreen />;

	if (session.restoring) {
		return (
			<div className="flex h-screen items-center justify-center bg-background text-foreground">
				<Logo className="h-14 w-14 animate-pulse" />
			</div>
		);
	}

	if (session.status !== "loggedIn") return <LoginScreen />;

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<AppHeader />
			<AppUpdateBanner />
			<YtDlpUpdateBanner />

			<main className="flex min-h-0 flex-1 gap-4 p-4">
				{Aside && <Aside />}
				<div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border bg-gradient-to-b from-card to-card/40 shadow-sm">
					<div
						key={view.name}
						className="h-full duration-200 animate-in fade-in motion-reduce:animate-none"
					>
						<MainViewComponent />
					</div>
				</div>
			</main>

			<ErrorBanner error={state.error} className="border-t" />
			<ErrorBanner
				error={library.error && `Server library: ${library.error}`}
				className="border-t"
			/>
			<ErrorBanner
				error={downloads.error && `Download: ${downloads.error.message}`}
				className="border-t"
			/>
			<NoticeBanner
				notice={downloads.done && `Saved to ${downloads.done.path}`}
				className="border-t"
			/>

			<PlayerBar />

			<UploadReviewDialog />
		</div>
	);
}

export default App;
