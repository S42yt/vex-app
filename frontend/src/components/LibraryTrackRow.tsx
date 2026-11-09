import { memo } from "react";
import {
	TrackArtistItems,
	TrackDeleteItem,
	TrackDownloadItem,
	TrackEditItem,
	TrackPlaylistsSubmenu,
} from "@/components/TrackMenuItems";
import { TrackRow } from "@/components/TrackRow";
import { ContextMenuSeparator } from "@/components/ui/context-menu";
import type { RemoteArtist, RemotePlaylist } from "@/api/types";
import type { Track } from "@/player/types";

export const LibraryTrackRow = memo(function LibraryTrackRow({
	track,
	index,
	artistIds,
	isCurrent,
	showBars,
	playlists,
	artists,
	onPlay,
	onEdit,
	onDelete,
	onTogglePlaylist,
	onNewPlaylist,
	onOpenArtist,
}: {
	track: Track;
	index: number;
	artistIds: readonly number[] | undefined;
	isCurrent: boolean;
	showBars: boolean;
	playlists: RemotePlaylist[];
	artists: RemoteArtist[];
	onPlay: (index: number) => void;
	onEdit: (track: Track) => void;
	onDelete: (track: Track) => void;
	onTogglePlaylist: (
		track: Track,
		playlistId: number,
		isMember: boolean,
	) => void;
	onNewPlaylist: (track: Track) => void;
	onOpenArtist: (artistId: number) => void;
}) {
	return (
		<TrackRow
			track={track}
			position={index + 1}
			isCurrent={isCurrent}
			showBars={showBars}
			onPlay={() => onPlay(index)}
			menuClassName="w-44"
			menu={
				<>
					<TrackEditItem onSelect={() => onEdit(track)} />
					<TrackArtistItems
						artistIds={artistIds}
						artists={artists}
						onOpenArtist={onOpenArtist}
					/>
					<TrackPlaylistsSubmenu
						track={track}
						playlists={playlists}
						onToggle={onTogglePlaylist}
						onNewPlaylist={onNewPlaylist}
					/>
					<TrackDownloadItem track={track} />
					<ContextMenuSeparator />
					<TrackDeleteItem onSelect={() => onDelete(track)} />
				</>
			}
		/>
	);
});
