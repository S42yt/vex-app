import {
	Music,
	Pause,
	Play,
	Repeat,
	Repeat1,
	Shuffle,
	SkipBack,
	SkipForward,
	Volume2,
	VolumeX,
} from "lucide-react";
import { CoverBackdrop } from "@/components/CoverBackdrop";
import { PlaybackEffects } from "@/components/PlaybackEffects";
import { BAR_GHOST, modeToggle } from "@/components/playerBarChrome";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { usePlayer } from "@/hooks/usePlayer";
import { formatTime } from "@/lib/utils";

export function PlayerBar() {
	const { state, controller } = usePlayer();
	const hasTrack = state.currentTrack !== null;
	const hasQueue = state.tracks.length > 0;

	return (
		<footer className="relative isolate grid grid-cols-[1fr_2fr_1fr] items-center gap-4 border-t bg-card px-4 py-3">
			<CoverBackdrop
				coverUrl={state.currentTrack?.coverUrl}
				controller={controller}
				isPlaying={state.isPlaying}
			/>

			<div className="flex min-w-0 items-center gap-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
					{state.currentTrack?.coverUrl ? (
						<img
							src={state.currentTrack.coverUrl}
							alt=""
							className="h-full w-full object-cover"
						/>
					) : (
						<Music className="h-5 w-5 text-muted-foreground" />
					)}
				</div>
				<div className="min-w-0">
					<p className="truncate text-sm font-medium">
						{state.currentTrack?.title ?? "—"}
					</p>
					<p className="truncate text-xs text-muted-foreground">
						{state.currentTrack?.artist ?? ""}
					</p>
				</div>
			</div>

			<div className="flex flex-col items-center gap-1.5">
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Shuffle: ${state.shuffled ? "on" : "off"}`}
						onClick={() => controller.toggleShuffle()}
						className={modeToggle(state.shuffled)}
					>
						<Shuffle className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Previous track"
						disabled={!hasQueue}
						onClick={() => controller.previous()}
						className={BAR_GHOST}
					>
						<SkipBack className="h-5 w-5" />
					</Button>
					<Button
						size="icon"
						className="h-10 w-10 rounded-full"
						aria-label={state.isPlaying ? "Pause" : "Play"}
						disabled={!hasQueue}
						onClick={() => controller.togglePlay()}
					>
						{state.isPlaying ? (
							<Pause className="h-5 w-5" />
						) : (
							<Play className="h-5 w-5 pl-0.5" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Next track"
						disabled={!hasQueue}
						onClick={() => controller.next()}
						className={BAR_GHOST}
					>
						<SkipForward className="h-5 w-5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Repeat: ${state.repeatMode}`}
						onClick={() => controller.cycleRepeatMode()}
						className={modeToggle(state.repeatMode !== "off")}
					>
						{state.repeatMode === "one" ? (
							<Repeat1 className="h-4 w-4" />
						) : (
							<Repeat className="h-4 w-4" />
						)}
					</Button>
				</div>
				<div className="flex w-full max-w-xl items-center gap-2">
					<span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
						{formatTime(state.currentTimeSec)}
					</span>
					<Slider
						value={[state.currentTimeSec]}
						max={state.durationSec || 1}
						step={1}
						disabled={!hasTrack}
						onValueChange={([value]) => controller.seek(value)}
						aria-label="Seek"
					/>
					<span className="w-12 text-xs tabular-nums text-muted-foreground">
						{formatTime(state.durationSec)}
					</span>
				</div>
			</div>

			<div className="flex items-center justify-end gap-2">
				<PlaybackEffects />
				<Button
					variant="ghost"
					size="icon"
					aria-label={state.muted ? "Unmute" : "Mute"}
					onClick={() => controller.toggleMute()}
					className={BAR_GHOST}
				>
					{state.muted || state.volume === 0 ? (
						<VolumeX className="h-5 w-5" />
					) : (
						<Volume2 className="h-5 w-5" />
					)}
				</Button>
				<Slider
					value={[state.muted ? 0 : state.volume]}
					max={1}
					step={0.01}
					onValueChange={([value]) => controller.setVolume(value)}
					className="w-24"
					aria-label="Volume"
				/>
			</div>
		</footer>
	);
}
