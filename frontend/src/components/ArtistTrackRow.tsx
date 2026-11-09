import { memo } from "react";
import { UserMinus } from "lucide-react";
import {
	TrackDeleteItem,
	TrackDownloadItem,
	TrackEditItem,
	TrackPlaylistsSubmenu,
} from "@/components/TrackMenuItems";
import { TrackRow } from "@/components/TrackRow";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { RemotePlaylist } from "@/api/types";
import type { Track } from "@/player/types";

export const ArtistTrackRow = memo(function ArtistTrackRow({
	track,
	rowIndex,
	isCurrent,
	showBars,
	playlists,
	onPlay,
	onEdit,
	onDelete,
	onUnlink,
	onTogglePlaylist,
	onNewPlaylist,
}: {
	track: Track;
	rowIndex: number;
	isCurrent: boolean;
	showBars: boolean;
	playlists: RemotePlaylist[];
	onPlay: (rowIndex: number) => void;
	onEdit: (track: Track) => void;
	onDelete: (track: Track) => void;
	onUnlink: (track: Track) => void;
	onTogglePlaylist: (
		track: Track,
		playlistId: number,
		isMember: boolean,
	) => void;
	onNewPlaylist: (track: Track) => void;
}) {
	return (
		<TrackRow
			track={track}
			position={rowIndex + 1}
			isCurrent={isCurrent}
			showBars={showBars}
			onPlay={() => onPlay(rowIndex)}
			menuClassName="w-52"
			menu={
				<>
					<TrackEditItem onSelect={() => onEdit(track)} />
					<TrackPlaylistsSubmenu
						track={track}
						playlists={playlists}
						onToggle={onTogglePlaylist}
						onNewPlaylist={onNewPlaylist}
					/>
					<TrackDownloadItem track={track} />
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={() => onUnlink(track)}>
						<UserMinus className="h-4 w-4" />
						Remove from this artist
					</ContextMenuItem>
					<ContextMenuSeparator />
					<TrackDeleteItem onSelect={() => onDelete(track)} />
				</>
			}
		/>
	);
});
