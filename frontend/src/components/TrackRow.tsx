import type { ReactNode } from "react";
import { EllipsisVertical } from "lucide-react";
import { NowPlayingBars } from "@/components/NowPlayingBars";
import { TrackArtwork } from "@/components/TrackArtwork";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { openRowMenu } from "@/lib/rowMenu";
import { cn, formatTime } from "@/lib/utils";
import type { Track } from "@/player/types";

export function TrackRow({
	track,
	position,
	isCurrent,
	showBars,
	onPlay,
	menu,
	menuClassName,
	dragHandle,
}: {
	track: Track;
	position: number;
	isCurrent: boolean;
	showBars: boolean;
	onPlay: () => void;
	menu: ReactNode;
	menuClassName?: string;
	dragHandle?: ReactNode;
}) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					role="button"
					tabIndex={0}
					onClick={onPlay}
					onKeyDown={(e) => {
						// Keys on the inner kebab bubble here; without the guard the row would
						// also play.
						if (e.target !== e.currentTarget) return;
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							onPlay();
						}
					}}
					className={cn(
						"group relative flex w-full cursor-pointer items-center gap-3 rounded-lg py-2 pr-2.5 text-left transition-colors",
						dragHandle ? "pl-1.5" : "pl-3",
						isCurrent ? "bg-accent" : "hover:bg-accent/60",
					)}
				>
					<span
						aria-hidden="true"
						className={cn(
							"absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity",
							isCurrent ? "opacity-100" : "opacity-0",
						)}
					/>
					{dragHandle}
					<span className="flex w-5 shrink-0 justify-center text-xs tabular-nums text-muted-foreground">
						{showBars ? <NowPlayingBars /> : position}
					</span>
					<TrackArtwork
						coverUrl={track.coverUrl}
						className="h-10 w-10"
						hoverPlay
						highlighted={isCurrent}
					/>
					<div className="min-w-0 flex-1">
						<p
							className={cn(
								"truncate text-sm font-medium",
								isCurrent && "text-primary",
							)}
						>
							{track.title}
						</p>
						<p className="truncate text-xs text-muted-foreground">
							{track.artist ?? "Unknown artist"}
							{track.album ? ` · ${track.album}` : ""}
						</p>
					</div>
					<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
						{formatTime(track.durationSec)}
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
						aria-label={`More options for ${track.title}`}
						onClick={(e) => {
							e.stopPropagation();
							openRowMenu(e.currentTarget);
						}}
					>
						<EllipsisVertical className="h-4 w-4" />
					</Button>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className={menuClassName ?? "w-48"}>
				{menu}
			</ContextMenuContent>
		</ContextMenu>
	);
}
