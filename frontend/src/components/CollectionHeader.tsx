import type { ReactNode } from "react";
import { ChevronLeft, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CollectionHeader({
	onBack,
	parentLabel,
	artwork,
	title,
	meta,
	playing,
	playLabel,
	onPlay,
	playDisabled,
	actions,
}: {
	onBack: () => void;
	parentLabel: string;
	artwork: ReactNode;
	title: string;
	meta: string;
	playing: boolean;
	playLabel: string;
	onPlay: () => void;
	playDisabled: boolean;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5 border-b bg-gradient-to-b from-accent/50 via-accent/10 to-transparent px-4 pb-3.5 pt-2.5">
			<button
				type="button"
				onClick={onBack}
				className="-ml-1.5 flex w-fit items-center gap-0.5 rounded-md py-0.5 pl-0.5 pr-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<ChevronLeft className="h-3.5 w-3.5" />
				{parentLabel}
			</button>

			<div className="flex items-end gap-3.5">
				{artwork}

				<div className="min-w-0 flex-1">
					<h2 className="truncate text-xl font-semibold tracking-tight">
						{title}
					</h2>
					<p className="truncate text-xs text-muted-foreground">{meta}</p>
				</div>

				<div className="flex shrink-0 items-center gap-2">
					{actions}
					<Button
						size="sm"
						className="rounded-full px-4"
						disabled={playDisabled}
						aria-label={playLabel}
						onClick={onPlay}
					>
						{playing ? (
							<>
								<Pause className="h-4 w-4 fill-current" />
								Pause
							</>
						) : (
							<>
								<Play className="h-4 w-4 fill-current" />
								Play
							</>
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
