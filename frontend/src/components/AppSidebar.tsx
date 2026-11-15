import { useState, type ComponentProps, type ReactNode } from "react";
import {
	Compass,
	Link2,
	ListMusic,
	LogOut,
	Music2,
	Plus,
	RefreshCw,
	Settings,
	Upload,
	Users,
} from "lucide-react";
import { artistService } from "@/api/ArtistService";
import { libraryData } from "@/api/LibraryData";
import { libraryService } from "@/api/LibraryService";
import { navigationService } from "@/api/NavigationService";
import { playlistQueueContext, playlistService } from "@/api/PlaylistService";
import { sessionService } from "@/api/SessionService";
import { uploadService } from "@/api/UploadService";
import { ImportUrlDialog } from "@/components/ImportUrlDialog";
import { Logo } from "@/components/Logo";
import { SidebarPlaylistItem } from "@/components/SidebarPlaylistItem";
import { GHOST_TINT } from "@/components/ghostChrome";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Popover as PopoverPrimitive } from "radix-ui";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { playerController } from "@/player/PlayerController";

type Icon = (props: { className?: string }) => ReactNode;

export function AppSidebar() {
	const view = useStore(navigationService);
	const library = useStore(libraryService);
	const playlists = useStore(playlistService);
	const artists = useStore(artistService);
	const player = useStore(playerController);
	const openPlaylistId = view.name === "playlists" ? view.openId : null;

	return (
		<aside className="flex w-58 shrink-0 flex-col overflow-hidden border-r bg-card/40">
			<div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-2">
				<div className="flex min-w-0 items-center gap-2.5">
					<Logo className="h-7 w-7 shrink-0" />
					<h1 className="truncate font-wordmark text-lg font-semibold tracking-tight">
						VexWave
					</h1>
				</div>
				<AddMenu />
			</div>

			<nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
				<SideItem
					icon={Compass}
					label="Discover"
					active={view.name === "discover"}
					onClick={() => navigationService.show("discover")}
				/>
			</nav>

			<GroupLabel id="sidebar-library-heading">Library</GroupLabel>
			<nav aria-labelledby="sidebar-library-heading" className="flex flex-col gap-0.5 px-2">
				<SideItem
					icon={Music2}
					label="Songs"
					count={library.tracks.length}
					active={view.name === "library"}
					onClick={() => navigationService.show("library")}
				/>
				<SideItem
					icon={ListMusic}
					label="Playlists"
					count={playlists.playlists.length}
					active={view.name === "playlists" && openPlaylistId === null}
					onClick={() => navigationService.show("playlists")}
				/>
				<SideItem
					icon={Users}
					label="Artists"
					count={artists.artists.length}
					active={view.name === "artists"}
					onClick={() => navigationService.show("artists")}
				/>
			</nav>

			{playlists.playlists.length > 0 && (
				<>
					<GroupLabel id="sidebar-playlists-heading">Playlists</GroupLabel>
					<ScrollArea className="min-h-0 flex-1">
						<nav
							aria-labelledby="sidebar-playlists-heading"
							className="flex flex-col gap-0.5 px-2"
						>
							{playlists.playlists.map((playlist) => {
								const ownsQueue =
									player.queueContextId === playlistQueueContext(playlist.id);
								return (
									<SidebarPlaylistItem
										key={playlist.id}
										playlist={playlist}
										active={playlist.id === openPlaylistId}
										ownsQueue={ownsQueue}
										playing={ownsQueue && player.isPlaying}
										onOpen={navigationService.openPlaylist}
									/>
								);
							})}
						</nav>
					</ScrollArea>
				</>
			)}

			<div className="mt-auto flex items-center gap-1 border-t p-2">
				<div className="flex-1">
					<SideItem
						icon={Settings}
						label="Settings"
						active={view.name === "settings"}
						onClick={() => navigationService.show("settings")}
					/>
				</div>
				<IconAction
					label="Refresh"
					disabled={library.loading}
					onClick={() => void libraryData.refresh()}
				>
					<RefreshCw className={cn(library.loading && "animate-spin")} />
				</IconAction>
				<IconAction
					label="Log out"
					className="hover:bg-destructive/10 dark:hover:bg-destructive/10 hover:text-red-400"
					onClick={() => void sessionService.logout()}
				>
					<LogOut />
				</IconAction>
			</div>
		</aside>
	);
}

function AddMenu() {
	const [urlOpen, setUrlOpen] = useState(false);
	return (
		<>
			<Popover>
				<PopoverTrigger asChild>
					<IconAction label="Add music">
						<Plus />
					</IconAction>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-52 p-1">
					<MenuItem
						icon={Upload}
						label="Add files"
						onClick={() => void uploadService.pick()}
					/>
					<MenuItem icon={Link2} label="Import from URL" onClick={() => setUrlOpen(true)} />
				</PopoverContent>
			</Popover>
			<ImportUrlDialog open={urlOpen} onClose={() => setUrlOpen(false)} />
		</>
	);
}

function MenuItem({ icon: Icon, label, onClick }: { icon: Icon; label: string; onClick: () => void }) {
	return (
		<PopoverPrimitive.Close
			onClick={onClick}
			className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm transition-colors hover:bg-foreground/10 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
		>
			<Icon className="h-4 w-4 text-muted-foreground" />
			{label}
		</PopoverPrimitive.Close>
	);
}

function IconAction({
	label,
	className,
	children,
	...props
}: { label: string; children: ReactNode } & ComponentProps<typeof Button>) {
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={label}
			title={label}
			className={cn("rounded-lg text-muted-foreground hover:text-foreground", GHOST_TINT, className)}
			{...props}
		>
			{children}
		</Button>
	);
}

function GroupLabel({ id, children }: { id: string; children: ReactNode }) {
	return (
		<h3
			id={id}
			className="px-5 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80"
		>
			{children}
		</h3>
	);
}

function SideItem({
	icon: Icon,
	label,
	count,
	active,
	onClick,
}: {
	icon: Icon;
	label: string;
	count?: number;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-current={active ? "page" : undefined}
			onClick={onClick}
			className={cn(
				"flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
				active
					? "bg-nav/15 text-foreground"
					: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
			)}
		>
			<Icon className={cn("h-4 w-4 shrink-0", active && "text-nav-bright")} />
			{label}
			{!!count && (
				<span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>
			)}
		</button>
	);
}
