import { useCallback, useMemo, useState } from "react";
import { Loader2, Music, Search } from "lucide-react";
import { LIBRARY_QUEUE_CONTEXT, libraryService } from "@/api/LibraryService";
import { navigationService } from "@/api/NavigationService";
import { EmptyState } from "@/components/EmptyState";
import { LibraryTrackRow } from "@/components/LibraryTrackRow";
import { PendingImportRow, PendingUploadRow } from "@/components/PendingRows";
import { SearchInput } from "@/components/SearchInput";
import { SECTIONS } from "@/components/Sections";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useArtists } from "@/hooks/useArtists";
import { useImports } from "@/hooks/useImports";
import { useLibrary } from "@/hooks/useLibrary";
import { usePlayer } from "@/hooks/usePlayer";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTrackActions } from "@/hooks/useTrackActions";
import { useUploads } from "@/hooks/useUploads";
import { formatTime, trackCountLabel } from "@/lib/utils";

function matches(query: string, ...fields: (string | undefined)[]): boolean {
	if (!query) return true;
	const needle = query.toLowerCase();
	return fields.some((field) => field?.toLowerCase().includes(needle));
}

export function TrackList() {
	const { state } = usePlayer();
	const { library } = useLibrary();
	const { playlists } = usePlaylists();
	const { artists } = useArtists();
	const { uploads } = useUploads();
	const { imports } = useImports();
	const actions = useTrackActions();
	const [query, setQuery] = useState("");
	const tracks = library.tracks;
	const playTrackAt = useCallback(
		(index: number) => libraryService.play(index),
		[],
	);

	const totalSec = useMemo(
		() => tracks.reduce((sum, track) => sum + track.durationSec, 0),
		[tracks],
	);
	const visible = useMemo(
		() =>
			tracks
				.map((track, index) => ({ track, index }))
				.filter(({ track }) =>
					matches(query, track.title, track.artist, track.album),
				),
		[tracks, query],
	);
	const visibleImports = imports.filter((job) =>
		matches(query, job.title ?? undefined, job.url),
	);
	const visibleUploads = uploads.filter((upload) =>
		matches(query, upload.title),
	);

	const ownsQueue = state.queueContextId === LIBRARY_QUEUE_CONTEXT;

	const isEmpty =
		tracks.length === 0 && uploads.length === 0 && imports.length === 0;
	const noMatches =
		!isEmpty &&
		visible.length === 0 &&
		visibleImports.length === 0 &&
		visibleUploads.length === 0;
	const firstLoad = library.loading && isEmpty;

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-3 px-4 py-2.5">
				<h2 className="shrink-0 text-sm font-semibold">Library</h2>
				{tracks.length > 0 && (
					<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
						{trackCountLabel(tracks.length)} · {formatTime(totalSec)}
					</span>
				)}
				<SearchInput
					value={query}
					onChange={setQuery}
					label="Search tracks"
					className="ml-auto w-40 min-w-0"
				/>
			</div>
			<Separator />

			{firstLoad ? (
				<div className="flex flex-1 items-center justify-center text-muted-foreground">
					<Loader2 className="h-6 w-6 animate-spin" />
				</div>
			) : isEmpty ? (
				<EmptyState
					framed
					icon={<Music className="h-9 w-9" />}
					title="Your library is empty."
					hint="Search YouTube or SoundCloud for something to add, paste a link, or drop audio files anywhere in the window."
					action={
						<Button
							variant="secondary"
							size="sm"
							onClick={() => navigationService.showSection("discover")}
						>
							<SECTIONS.discover.Icon className="h-4 w-4" />
							{SECTIONS.discover.label}
						</Button>
					}
				/>
			) : noMatches ? (
				<EmptyState
					icon={<Search className="h-8 w-8" />}
					title={`No tracks match “${query}”.`}
				/>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<ul className="flex flex-col gap-1 p-2">
						{visibleImports.map((job) => (
							<li key={job.id}>
								<PendingImportRow job={job} />
							</li>
						))}
						{visibleUploads.map((upload) => (
							<li key={upload.id}>
								<PendingUploadRow upload={upload} />
							</li>
						))}
						{visible.map(({ track, index }) => {
							const isCurrent =
								ownsQueue && track.id === state.currentTrack?.id;
							const remote = libraryService.getRemote(track.id);
							return (
								<li key={track.id}>
									<LibraryTrackRow
										track={track}
										index={index}
										artistIds={remote?.artistIds}
										isCurrent={isCurrent}
										showBars={isCurrent && state.isPlaying}
										playlists={playlists.playlists}
										artists={artists.artists}
										onPlay={playTrackAt}
										onEdit={actions.edit}
										onDelete={actions.remove}
										onTogglePlaylist={actions.togglePlaylist}
										onNewPlaylist={actions.newPlaylist}
										onOpenArtist={navigationService.openArtist}
									/>
								</li>
							);
						})}
					</ul>
				</ScrollArea>
			)}

			{actions.dialogs}
		</div>
	);
}
