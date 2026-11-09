import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Compass, RotateCw, SearchX } from "lucide-react";
import { importService, parseImportUrl } from "@/api/ImportService";
import { DiscoverCard, DiscoverCardSkeleton } from "@/components/DiscoverCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PLATFORM_ORDER, PLATFORMS } from "@/components/Platforms";
import { SearchInput } from "@/components/SearchInput";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useDiscover } from "@/hooks/useDiscover";
import { useImports } from "@/hooks/useImports";
import { cn, countLabel } from "@/lib/utils";
import type { ImportJob } from "@/api/ImportService";
import type { MediaSearchResult, SearchSource } from "@/api/types";

const RESULT_GRID = "grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3 p-4";

interface ResultCard {
	result: MediaSearchResult;
	job: ImportJob | null;
	downloadable: boolean;
}

export function DiscoverView() {
	const { discover, service } = useDiscover();
	const { imports } = useImports();
	const [input, setInput] = useState(discover.query);

	const cards = useMemo<ResultCard[]>(
		() =>
			discover.results.map((result) => {
				const url = parseImportUrl(result.url);
				return {
					result,
					job: url ? importService.jobFor(url) : null,
					downloadable: url !== null,
				};
			}),
		[discover.results, imports],
	);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		void service.search(input);
	};

	const sourceLabel = PLATFORMS[discover.source].label;

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-3 px-4 py-2.5">
				<h2 className="shrink-0 text-sm font-semibold">Discover</h2>
				{discover.results.length > 0 && (
					<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
						{countLabel(discover.results.length, "result")}
					</span>
				)}
				<form className="ml-auto flex items-center gap-2" onSubmit={handleSubmit}>
					<SourceToggle value={discover.source} onChange={service.setSource} />
					<SearchInput
						value={input}
						onChange={setInput}
						label={`Search ${sourceLabel}`}
						placeholder={`Search ${sourceLabel}`}
						className="w-72 min-w-0"
						autoFocus
					/>
					<Button
						type="submit"
						variant="secondary"
						size="sm"
						disabled={input.trim() === "" || discover.loading}
					>
						Search
					</Button>
				</form>
			</div>
			<Separator />

			<ErrorBanner error={discover.error} className="border-b" />

			{discover.loading ? (
				<ResultSkeletons />
			) : cards.length > 0 ? (
				<ResultGrid cards={cards} onDownload={service.download} />
			) : discover.error ? (
				<EmptyState
					icon={<AlertCircle className="h-8 w-8" />}
					title="That search didn't come back."
					action={
						<Button variant="secondary" size="sm" onClick={service.retry}>
							<RotateCw className="h-4 w-4" />
							Try again
						</Button>
					}
				/>
			) : discover.query ? (
				<EmptyState
					icon={<SearchX className="h-8 w-8" />}
					title={`No results for “${discover.query}”.`}
					hint={`Nothing on ${sourceLabel} matched — try different words, or the other platform.`}
				/>
			) : (
				<EmptyState
					framed
					icon={<Compass className="h-9 w-9" />}
					title={`Search ${sourceLabel} for something to listen to.`}
					hint="Downloads land in the review dialog first, so you can fix the title, cover and artist before they reach your library."
				/>
			)}
		</div>
	);
}

function ResultGrid({
	cards,
	onDownload,
}: {
	cards: readonly ResultCard[];
	onDownload: (result: MediaSearchResult) => void;
}) {
	return (
		<ScrollArea className="min-h-0 flex-1">
			<ul className={RESULT_GRID}>
				{cards.map(({ result, job, downloadable }) => (
					<li key={result.id}>
						<DiscoverCard
							result={result}
							job={job}
							downloadable={downloadable}
							onDownload={onDownload}
						/>
					</li>
				))}
			</ul>
		</ScrollArea>
	);
}

function SourceToggle({
	value,
	onChange,
}: {
	value: SearchSource;
	onChange: (source: SearchSource) => void;
}) {
	return (
		<div
			role="group"
			aria-label="Search platform"
			className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted/60 p-0.5"
		>
			{PLATFORM_ORDER.map((source) => {
				const { label, Icon, colorClass } = PLATFORMS[source];
				const active = source === value;
				return (
					<button
						key={source}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(source)}
						className={cn(
							"flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							active
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Icon className={cn("h-3.5 w-3.5", active && colorClass)} />
						{label}
					</button>
				);
			})}
		</div>
	);
}

function ResultSkeletons() {
	return (
		<div className="min-h-0 flex-1 overflow-hidden">
			<ul aria-hidden="true" className={RESULT_GRID}>
				{Array.from({ length: 12 }, (_, i) => (
					<li key={i}>
						<DiscoverCardSkeleton index={i} />
					</li>
				))}
			</ul>
		</div>
	);
}
