import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { playlistService } from "@/api/PlaylistService";
import { SearchInput } from "@/components/SearchInput";
import { TrackArtwork } from "@/components/TrackArtwork";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RemotePlaylist } from "@/api/types";
import type { Track } from "@/player/types";
import { libraryService } from "@/api/LibraryService";
import { useStore } from "@/lib/store";

export function AddTracksDialog({
	playlist,
	open,
	onOpenChange,
}: {
	playlist: RemotePlaylist | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const library = useStore(libraryService);
	const [query, setQuery] = useState("");

	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return library.tracks;
		return library.tracks.filter(
			(track) =>
				track.title.toLowerCase().includes(needle) ||
				track.artist?.toLowerCase().includes(needle),
		);
	}, [library.tracks, query]);

	const isIn = (track: Track): boolean =>
		playlist !== null && playlist.trackIds.includes(track.id);

	const toggle = (track: Track) => {
		if (!playlist) return;
		void (isIn(track)
			? playlistService.removeTracks(playlist.id, [track.id])
			: playlistService.addTracks(playlist.id, [track.id]));
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) setQuery("");
				onOpenChange(next);
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add tracks</DialogTitle>
					<DialogDescription>
						Add library tracks to “{playlist?.name}”; click an added track to
						remove it again.
					</DialogDescription>
				</DialogHeader>
				<SearchInput
					autoFocus
					value={query}
					onChange={setQuery}
					placeholder="Search tracks"
					label="Search tracks"
				/>
				<ScrollArea className="h-72">
					{visible.length === 0 ? (
						<div className="flex h-full items-center justify-center py-10 text-sm text-muted-foreground">
							{library.tracks.length === 0
								? "The library is empty."
								: `No tracks match “${query}”.`}
						</div>
					) : (
						<ul className="flex flex-col gap-1 pr-3">
							{visible.map((track) => {
								const included = isIn(track);
								return (
									<li key={track.id}>
										<div className="flex w-full items-center gap-3 rounded-lg py-1.5 pl-2 pr-1">
											<TrackArtwork
												coverUrl={track.coverUrl}
												className="h-9 w-9"
												iconClassName="h-4 w-4"
											/>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium">
													{track.title}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{track.artist ?? "Unknown artist"}
												</p>
											</div>
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
												aria-label={
													included
														? `Remove ${track.title}`
														: `Add ${track.title}`
												}
												onClick={() => toggle(track)}
											>
												{included ? (
													<Check className="h-4 w-4 text-primary" />
												) : (
													<Plus className="h-4 w-4" />
												)}
											</Button>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</ScrollArea>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Done
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
