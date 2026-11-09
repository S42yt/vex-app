import { useCallback, useState, type ReactNode } from "react";
import { playlistService } from "@/api/PlaylistService";
import { DeleteTrackDialog } from "@/components/DeleteTrackDialog";
import { EditTrackDialog } from "@/components/EditTrackDialog";
import { PlaylistDialog } from "@/components/PlaylistDialog";
import type { Track } from "@/player/types";

export interface TrackActions {
	edit: (track: Track) => void;
	remove: (track: Track) => void;
	togglePlaylist: (track: Track, playlistId: number, isMember: boolean) => void;
	newPlaylist: (track: Track) => void;
	dialogs: ReactNode;
}

export function useTrackActions(): TrackActions {
	const [editTrack, setEditTrack] = useState<Track | null>(null);
	const [deleteTrack, setDeleteTrack] = useState<Track | null>(null);
	const [playlistSeed, setPlaylistSeed] = useState<Track | null>(null);

	const togglePlaylist = useCallback(
		(track: Track, playlistId: number, isMember: boolean) => {
			void (isMember
				? playlistService.removeTracks(playlistId, [track.id])
				: playlistService.addTracks(playlistId, [track.id]));
		},
		[],
	);

	const dialogs = (
		<>
			<EditTrackDialog
				track={editTrack}
				open={editTrack !== null}
				onOpenChange={(open) => {
					if (!open) setEditTrack(null);
				}}
			/>

			<PlaylistDialog
				playlist={null}
				seedTrackIds={playlistSeed ? [playlistSeed.id] : undefined}
				open={playlistSeed !== null}
				onOpenChange={(open) => {
					if (!open) setPlaylistSeed(null);
				}}
			/>

			<DeleteTrackDialog
				track={deleteTrack}
				open={deleteTrack !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteTrack(null);
				}}
			/>
		</>
	);

	return {
		edit: setEditTrack,
		remove: setDeleteTrack,
		togglePlaylist,
		newPlaylist: setPlaylistSeed,
		dialogs,
	};
}
