import { useCallback, useMemo } from "react";
import { Pencil, Users } from "lucide-react";
import { artistQueueContext, artistService } from "@/api/ArtistService";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ArtistTrackRow } from "@/components/ArtistTrackRow";
import { CollectionHeader } from "@/components/CollectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useArtists } from "@/hooks/useArtists";
import { useLibrary } from "@/hooks/useLibrary";
import { usePlayer } from "@/hooks/usePlayer";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTrackActions } from "@/hooks/useTrackActions";
import { formatTime, trackCountLabel } from "@/lib/utils";
import type { RemoteArtist } from "@/api/types";
import type { Track } from "@/player/types";

export function ArtistDetail({
	artist,
	onBack,
	onEdit,
}: {
	artist: RemoteArtist;
	onBack: () => void;
	onEdit: () => void;
}) {
	const { state } = usePlayer();
	const { library } = useLibrary();
	const { artists } = useArtists();
	const { playlists } = usePlaylists();
	const actions = useTrackActions();

	const tracks = useMemo(
		() => artistService.tracksOf(artist),
		[artist, library.tracks],
	);
	const totalSec = useMemo(
		() => tracks.reduce((sum, track) => sum + track.durationSec, 0),
		[tracks],
	);

	const playRow = useCallback(
		(rowIndex: number) => artistService.play(artist, rowIndex),
		[artist],
	);
	const unlinkRow = useCallback(
		(track: Track) => void artistService.unlinkTrack(artist, track.id),
		[artist],
	);

	const ownsQueue = state.queueContextId === artistQueueContext(artist.id);

	return (
		<div className="flex h-full flex-col">
			<CollectionHeader
				onBack={onBack}
				parentLabel="Artists"
				artwork={
					<ArtistAvatar
						imageUrl={artist.imageUrl}
						className="h-16 w-16 shadow-md ring-1 ring-inset ring-border/60"
						iconClassName="h-7 w-7"
					/>
				}
				title={artist.name}
				meta={`${trackCountLabel(tracks.length)}${
					tracks.length > 0 ? ` · ${formatTime(totalSec)}` : ""
				}`}
				playing={ownsQueue && state.isPlaying}
				playLabel={
					ownsQueue && state.isPlaying
						? `Pause ${artist.name}`
						: `Play ${artist.name}`
				}
				playDisabled={tracks.length === 0}
				onPlay={() => artistService.playOrToggle(artist)}
				actions={
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						aria-label={`Edit ${artist.name}`}
						onClick={onEdit}
					>
						<Pencil className="h-4 w-4" />
					</Button>
				}
			/>

			<ErrorBanner error={artists.error} className="border-b" />

			{tracks.length === 0 ? (
				<EmptyState
					icon={<Users className="h-12 w-12" />}
					title={`No tracks credited to ${artist.name} yet — link some from a track's “Edit…” menu.`}
				/>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<ul className="flex flex-col gap-1 p-2">
						{tracks.map((track, rowIndex) => {
							const isCurrent =
								ownsQueue && track.id === state.currentTrack?.id;
							return (
								<li key={track.id}>
									<ArtistTrackRow
										track={track}
										rowIndex={rowIndex}
										isCurrent={isCurrent}
										showBars={isCurrent && state.isPlaying}
										playlists={playlists.playlists}
										onPlay={playRow}
										onEdit={actions.edit}
										onDelete={actions.remove}
										onUnlink={unlinkRow}
										onTogglePlaylist={actions.togglePlaylist}
										onNewPlaylist={actions.newPlaylist}
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
