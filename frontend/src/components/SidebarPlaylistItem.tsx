import { memo, useMemo } from "react";
import { Pause, Play } from "lucide-react";
import { playlistService } from "@/api/PlaylistService";
import { NowPlayingRing } from "@/components/NowPlayingRing";
import { PlaylistCover } from "@/components/PlaylistCover";
import { GHOST_TINT } from "@/components/ghostChrome";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RemotePlaylist } from "@/api/types";
import { libraryService } from "@/api/LibraryService";
import { useStore } from "@/lib/store";

export const SidebarPlaylistItem = memo(function SidebarPlaylistItem({
	playlist,
	active,
	ownsQueue,
	playing,
	onOpen,
}: {
	playlist: RemotePlaylist;
	active: boolean;
	ownsQueue: boolean;
	playing: boolean;
	onOpen: (playlistId: number) => void;
}) {
	const library = useStore(libraryService);
	const tracks = useMemo(
		() => playlistService.tracksOf(playlist),
		[playlist, library.tracks],
	);

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onOpen(playlist.id)}
			onKeyDown={(e) => {
				if (e.target !== e.currentTarget) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen(playlist.id);
				}
			}}
			aria-current={active ? "page" : undefined}
			className={cn(
				"group flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-2 pr-1.5 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
				active ? "bg-nav/15" : "hover:bg-foreground/5",
			)}
		>
			<div className="relative h-7 w-7 shrink-0">
				<NowPlayingRing ownsQueue={ownsQueue} playing={playing} />
				<PlaylistCover
					playlist={playlist}
					tracks={tracks}
					className="h-full w-full"
					iconClassName="h-3 w-3"
				/>
			</div>
			<span
				className={cn(
					"min-w-0 flex-1 truncate text-sm font-medium transition-colors",
					ownsQueue
						? "text-primary"
						: active
							? "text-foreground"
							: "text-muted-foreground group-hover:text-foreground",
				)}
			>
				{playlist.name}
			</span>
			{tracks.length > 0 && (
				<Button
					variant="ghost"
					size="icon"
					className={cn(
						"h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
						GHOST_TINT,
					)}
					aria-label={
						playing ? `Pause ${playlist.name}` : `Play ${playlist.name}`
					}
					onClick={(e) => {
						e.stopPropagation();
						playlistService.playOrToggle(playlist);
					}}
				>
					{playing ? (
						<Pause className="h-3.5 w-3.5 fill-current" />
					) : (
						<Play className="h-3.5 w-3.5 fill-current" />
					)}
				</Button>
			)}
		</div>
	);
});
