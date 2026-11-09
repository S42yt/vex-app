import { cn } from "@/lib/utils";

export function NowPlayingRing({
	ownsQueue,
	playing,
	round,
}: {
	ownsQueue: boolean;
	playing: boolean;
	round?: boolean;
}) {
	return (
		<>
			<span
				aria-hidden="true"
				className={cn(
					"np-ring np-ring--base",
					round && "np-ring--round",
					ownsQueue && "np-ring--on",
				)}
			/>
			<span
				aria-hidden="true"
				className={cn(
					"np-ring np-ring--arc",
					round && "np-ring--round",
					playing && "np-ring--on",
				)}
			/>
		</>
	);
}
