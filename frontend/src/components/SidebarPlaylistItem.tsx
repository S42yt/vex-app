import { memo, useMemo } from "react";
import { Pause, Play } from "lucide-react";
import { playlistService } from "@/api/PlaylistService";
import { NowPlayingRing } from "@/components/NowPlayingRing";
import { PlaylistCover } from "@/components/PlaylistCover";
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
				"group relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg py-1.5 pl-2 pr-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				active ? "bg-accent" : "hover:bg-accent/50",
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200",
					active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
				)}
			/>
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
							? "text-accent-foreground"
							: "text-muted-foreground group-hover:text-foreground",
				)}
			>
				{playlist.name}
			</span>
			{tracks.length > 0 && (
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
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
