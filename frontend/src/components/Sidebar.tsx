import { ListMusic, LibraryBig, Users } from "lucide-react";
import { playlistQueueContext } from "@/api/PlaylistService";
import { SidebarPlaylistItem } from "@/components/SidebarPlaylistItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useArtists } from "@/hooks/useArtists";
import { useLibrary } from "@/hooks/useLibrary";
import { useNavigation } from "@/hooks/useNavigation";
import { usePlayer } from "@/hooks/usePlayer";
import { usePlaylists } from "@/hooks/usePlaylists";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
	{ view: "library", label: "Library", icon: LibraryBig },
	{ view: "playlists", label: "Playlists", icon: ListMusic },
	{ view: "artists", label: "Artists", icon: Users },
] as const;

type NavView = (typeof NAV_ITEMS)[number]["view"];

export function Sidebar() {
	const { view, service: navigation } = useNavigation();
	const { library } = useLibrary();
	const { playlists } = usePlaylists();
	const { artists } = useArtists();
	const { state: playerState } = usePlayer();

	const counts: Record<NavView, number> = {
		library: library.tracks.length,
		playlists: playlists.playlists.length,
		artists: artists.artists.length,
	};

	const openPlaylistId = view.name === "playlists" ? view.openId : null;

	return (
		<div className="flex h-full w-[200px] shrink-0 flex-col overflow-hidden rounded-xl border bg-gradient-to-b from-card to-card/40 shadow-sm">
			<nav className="flex flex-col gap-1 p-2" aria-label="Main">
				{NAV_ITEMS.map((item) => {
					const active =
						item.view === view.name &&
						(item.view !== "playlists" || openPlaylistId === null);
					const count = counts[item.view];
					return (
						<button
							key={item.view}
							type="button"
							className={cn(
								"group relative flex w-full items-center gap-3 rounded-lg py-2 pl-4 pr-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								active
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
							)}
							aria-current={active ? "page" : undefined}
							onClick={() => navigation.show(item.view)}
						>
							<span
								aria-hidden="true"
								className={cn(
									"absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200",
									active
										? "scale-y-100 opacity-100"
										: "scale-y-0 opacity-0",
								)}
							/>
							<item.icon
								className={cn(
									"h-4 w-4 shrink-0 transition-colors",
									active
										? "text-nav-bright"
										: "text-muted-foreground group-hover:text-foreground",
								)}
							/>
							{item.label}
							{!!count && (
								<span
									className={cn(
										"ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-medium leading-none tabular-nums transition-colors",
										active
											? "bg-nav-edge/20 text-foreground"
											: "bg-muted/70 text-muted-foreground",
									)}
								>
									{count}
								</span>
							)}
						</button>
					);
				})}
			</nav>

			{playlists.playlists.length > 0 && (
				<div className="flex min-h-0 flex-1 flex-col border-t">
					<h3
						id="sidebar-playlists-heading"
						className="px-4 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						Playlists
					</h3>
					<ScrollArea className="min-h-0 flex-1">
						<nav
							className="flex flex-col gap-0.5 p-2 pt-0"
							aria-labelledby="sidebar-playlists-heading"
						>
							{playlists.playlists.map((playlist) => {
								const ownsQueue =
									playerState.queueContextId ===
									playlistQueueContext(playlist.id);
								return (
									<SidebarPlaylistItem
										key={playlist.id}
										playlist={playlist}
										active={playlist.id === openPlaylistId}
										ownsQueue={ownsQueue}
										playing={ownsQueue && playerState.isPlaying}
										onOpen={navigation.openPlaylist}
									/>
								);
							})}
						</nav>
					</ScrollArea>
				</div>
			)}
		</div>
	);
}
