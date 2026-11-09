import { Music, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export function TrackArtwork({
	coverUrl,
	className,
	iconClassName,
	hoverPlay,
	highlighted,
}: {
	coverUrl?: string;
	className?: string;
	iconClassName?: string;
	hoverPlay?: boolean;
	highlighted?: boolean;
}) {
	return (
		<span
			className={cn(
				"relative block shrink-0 overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-inset ring-border/60 transition-shadow",
				highlighted && "ring-primary/40",
				className,
			)}
		>
			{coverUrl ? (
				<img src={coverUrl} alt="" className="h-full w-full object-cover" />
			) : (
				<Music
					className={cn(
						"absolute inset-0 m-auto text-muted-foreground",
						iconClassName ?? "h-5 w-5",
					)}
				/>
			)}
			{hoverPlay && (
				<span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
					<Play className="h-4 w-4 fill-white text-white" />
				</span>
			)}
		</span>
	);
}
