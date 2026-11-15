import { memo } from "react";
import { Ban, Download, Loader2, RotateCw } from "lucide-react";
import { discoverService } from "@/api/DiscoverService";
import { importPercent, importStatusLabel } from "@/api/ImportService";
import { TrackArtwork } from "@/components/TrackArtwork";
import { Button } from "@/components/ui/button";
import { cn, formatTime } from "@/lib/utils";
import type { ImportJob } from "@/api/ImportService";
import type { MediaSearchResult } from "@/api/types";

export interface DiscoverItem {
	result: MediaSearchResult;
	job: ImportJob | null;
	downloadable: boolean;
}

export const TopResult = memo(function TopResult(item: DiscoverItem) {
	const { result, job } = item;
	const percent = job ? importPercent(job) : null;
	return (
		<div className="flex items-center gap-5 rounded-xl border bg-muted/30 p-4">
			<TrackArtwork coverUrl={result.thumbnailUrl} className="size-32 rounded-lg" iconClassName="size-9" />
			<div className="min-w-0 flex-1 space-y-3">
				<div className="space-y-1">
					<p className="line-clamp-2 text-lg font-semibold leading-snug" title={result.title}>
						{result.title}
					</p>
					<Subtitle
						item={item}
						className="text-sm"
						suffix={result.durationSec === undefined ? "" : ` · ${formatTime(result.durationSec)}`}
					/>
				</div>
				<div className="flex items-center gap-3">
					<DownloadAction item={item} labelled />
					{percent !== null && <ProgressBar percent={percent} className="h-1 max-w-48 flex-1" />}
				</div>
			</div>
		</div>
	);
});

export const ResultRow = memo(function ResultRow({
	position,
	...item
}: DiscoverItem & { position: number }) {
	const { result, job } = item;
	const percent = job ? importPercent(job) : null;
	return (
		<div className="group relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-2 transition-colors hover:bg-accent/60">
			<span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
				{position}
			</span>
			<TrackArtwork coverUrl={result.thumbnailUrl} className="size-11" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium" title={result.title}>
					{result.title}
				</p>
				<Subtitle item={item} className="text-xs" />
			</div>
			{result.durationSec !== undefined && (
				<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
					{formatTime(result.durationSec)}
				</span>
			)}
			<DownloadAction item={item} />
			{percent !== null && (
				<ProgressBar percent={percent} className="absolute inset-x-3 bottom-0.5 h-0.5" />
			)}
		</div>
	);
});

export function TopResultSkeleton() {
	return (
		<div className="flex animate-pulse items-center gap-5 rounded-xl border bg-muted/30 p-4">
			<div className="size-32 shrink-0 rounded-lg bg-foreground/10" />
			<div className="flex-1 space-y-3">
				<div className="h-5 w-3/5 rounded bg-foreground/10" />
				<div className="h-3 w-1/4 rounded bg-foreground/10" />
				<div className="h-8 w-28 rounded-md bg-foreground/10" />
			</div>
		</div>
	);
}

export function ResultRowSkeleton({ index }: { index: number }) {
	return (
		<div
			className="flex animate-pulse items-center gap-3 py-2 pl-11"
			style={{ animationDelay: `${index * 80}ms` }}
		>
			<div className="size-11 shrink-0 rounded-md bg-foreground/10" />
			<div className="flex-1 space-y-2">
				<div className="h-3 w-2/5 rounded bg-foreground/10" />
				<div className="h-2.5 w-1/5 rounded bg-foreground/10" />
			</div>
		</div>
	);
}

function Subtitle({
	item: { result, job },
	className,
	suffix = "",
}: {
	item: DiscoverItem;
	className: string;
	suffix?: string;
}) {
	return (
		<p
			className={cn(
				"truncate",
				job?.step === "error" ? "text-destructive" : job ? "text-foreground" : "text-muted-foreground",
				className,
			)}
		>
			{job ? importStatusLabel(job) : `${result.artist ?? "Unknown creator"}${suffix}`}
		</p>
	);
}

function DownloadAction({
	item: { result, job, downloadable },
	labelled,
}: {
	item: DiscoverItem;
	labelled?: boolean;
}) {
	if (!downloadable) {
		return (
			<span
				role="img"
				title="Can't be imported"
				aria-label={`${result.title} can't be imported`}
				className="flex size-8 shrink-0 items-center justify-center text-muted-foreground/60"
			>
				<Ban className="size-4" />
			</span>
		);
	}
	const failed = job?.step === "error";
	const running = job !== null && !failed;
	return (
		<Button
			size={labelled ? "sm" : "icon-sm"}
			variant={failed ? "destructive" : labelled ? "default" : "ghost"}
			disabled={running}
			onClick={() => discoverService.download(result)}
			aria-label={
				job === null
					? `Download ${result.title}`
					: failed
						? `Retry downloading ${result.title}`
						: `Downloading ${result.title}`
			}
			className={cn(
				"shrink-0 disabled:opacity-100",
				!labelled &&
					!failed &&
					"text-muted-foreground hover:bg-primary/15 hover:text-primary group-hover:text-foreground",
			)}
		>
			{running ? (
				<ProgressRing percent={importPercent(job)} />
			) : failed ? (
				<RotateCw />
			) : (
				<Download />
			)}
			{labelled && (running ? "Downloading" : failed ? "Retry" : "Download")}
		</Button>
	);
}

function ProgressRing({ percent }: { percent: number | null }) {
	if (percent === null) return <Loader2 className="animate-spin" />;
	return (
		<svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 -rotate-90 fill-none stroke-[2.5]">
			<circle cx="10" cy="10" r="8" className="stroke-current opacity-25" />
			<circle
				cx="10"
				cy="10"
				r="8"
				pathLength={100}
				strokeDasharray={`${percent} 100`}
				strokeLinecap="round"
				className="stroke-primary"
			/>
		</svg>
	);
}

function ProgressBar({ percent, className }: { percent: number; className: string }) {
	return (
		<div className={cn("overflow-hidden rounded-full bg-foreground/10", className)}>
			<div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${percent}%` }} />
		</div>
	);
}
