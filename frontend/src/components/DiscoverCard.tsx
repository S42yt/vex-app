import { memo, useState } from "react";
import { Ban, Download, Loader2, Music, RotateCw } from "lucide-react";
import { importPercent, importStatusLabel } from "@/api/ImportService";
import { Button } from "@/components/ui/button";
import { knownCoverFit, measureCoverFit } from "@/lib/coverFit";
import { cn, formatTime } from "@/lib/utils";
import type { SyntheticEvent } from "react";
import type { ImportJob } from "@/api/ImportService";
import type { CoverFit } from "@/lib/coverFit";
import type { MediaSearchResult } from "@/api/types";

const SLEEVE =
	"relative aspect-square w-full overflow-hidden rounded-2xl bg-muted";

const CORNER_SLOT =
	"absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full shadow-lg";

export const DiscoverCard = memo(function DiscoverCard({
	result,
	job,
	downloadable,
	onDownload,
}: {
	result: MediaSearchResult;
	job: ImportJob | null;
	downloadable: boolean;
	onDownload: (result: MediaSearchResult) => void;
}) {
	const failed = job?.step === "error";
	const running = job !== null && !failed;
	const percent = job ? importPercent(job) : null;
	const actionable = !running && downloadable;

	return (
		<div
			className={cn(
				SLEEVE,
				"group isolate shadow-md shadow-black/20 transition-shadow duration-200 hover:shadow-xl hover:shadow-black/30",
			)}
		>
			<SleeveArt url={result.thumbnailUrl} />

			<div
				className={cn(
					"absolute inset-0 rounded-[inherit] transition-colors duration-200",
					running ? "bg-black/40" : "bg-black/0",
					actionable && "group-hover:bg-black/30",
				)}
			/>

			<div className="absolute inset-x-0 bottom-0 h-2/3 rounded-b-[inherit] bg-gradient-to-t from-black via-black/55 to-transparent" />

			<div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />

			{result.durationSec !== undefined && (
				<span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white shadow-sm">
					{formatTime(result.durationSec)}
				</span>
			)}

			<div className="absolute inset-x-0 bottom-0 min-w-0 p-3 pr-12">
				<p className="line-clamp-2 text-sm font-semibold leading-snug text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
					{result.title}
				</p>
				<p
					className={cn(
						"mt-1 truncate text-xs text-white/70",
						failed && "text-red-400",
					)}
				>
					{job ? importStatusLabel(job) : (result.artist ?? "Unknown creator")}
				</p>
			</div>

			{downloadable ? (
				<Button
					size="icon"
					variant={failed ? "destructive" : "default"}
					disabled={running}
					onClick={() => onDownload(result)}
					aria-label={
						job === null
							? `Download ${result.title}`
							: failed
								? `Retry downloading ${result.title}`
								: `Downloading ${result.title}`
					}
					className={cn(
						CORNER_SLOT,
						"transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-100",
						running
							? "bg-black/70 text-white"
							: !failed &&
								"opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
					)}
				>
					{failed ? (
						<RotateCw />
					) : running ? (
						<Loader2 className="animate-spin" />
					) : (
						<Download />
					)}
				</Button>
			) : (
				<span
					role="img"
					title="Can't be imported"
					aria-label={`${result.title} can't be imported`}
					className={cn(CORNER_SLOT, "bg-black/70 text-white/60")}
				>
					<Ban className="h-4 w-4" />
				</span>
			)}

			{percent !== null && (
				<div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-[inherit] bg-black/50">
					<div
						className="h-full bg-primary transition-[width] duration-200"
						style={{ width: `${percent}%` }}
					/>
				</div>
			)}
		</div>
	);
});

export function DiscoverCardSkeleton({ index }: { index: number }) {
	return (
		<div
			className={cn(SLEEVE, "flex animate-pulse flex-col justify-end gap-2 p-3")}
			style={{ animationDelay: `${index * 80}ms` }}
		>
			<div className="h-3 w-4/5 rounded bg-foreground/10" />
			<div className="h-2.5 w-2/5 rounded bg-foreground/10" />
		</div>
	);
}

function SleeveArt({ url }: { url: string | undefined }) {
	const [measured, setMeasured] = useState<CoverFit | null>(null);
	const [broken, setBroken] = useState(false);

	if (!url || broken) {
		return <Music className="absolute inset-0 m-auto h-9 w-9 text-muted-foreground" />;
	}

	const fit = measured ?? knownCoverFit(url) ?? "contain";

	const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
		const next = measureCoverFit(url, e.currentTarget);
		if (next !== fit) setMeasured(next);
	};

	return (
		<>
			{fit === "contain" && (
				<img
					src={url}
					alt=""
					aria-hidden="true"
					loading="lazy"
					crossOrigin="anonymous"
					className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-xl saturate-150"
				/>
			)}
			<img
				src={url}
				alt=""
				loading="lazy"
				crossOrigin="anonymous"
				onLoad={handleLoad}
				onError={() => setBroken(true)}
				className={cn(
					"absolute inset-0 h-full w-full rounded-[inherit]",
					fit === "cover" ? "object-cover" : "object-contain",
				)}
			/>
		</>
	);
}
