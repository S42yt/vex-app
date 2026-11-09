import { Download, ListMusic, Pencil, Plus, Trash2, Users } from "lucide-react";
import { downloadService } from "@/api/DownloadService";
import {
	ContextMenuCheckboxItem,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useDownloads } from "@/hooks/useDownloads";
import type { RemoteArtist, RemotePlaylist } from "@/api/types";
import type { Track } from "@/player/types";

export function TrackEditItem({ onSelect }: { onSelect: () => void }) {
	return (
		<ContextMenuItem onSelect={onSelect}>
			<Pencil className="h-4 w-4" />
			Edit…
		</ContextMenuItem>
	);
}

export function TrackArtistItems({
	artistIds,
	artists,
	onOpenArtist,
}: {
	artistIds: readonly number[] | undefined;
	artists: RemoteArtist[];
	onOpenArtist: (artistId: number) => void;
}) {
	const linked = artistIds
		? artists.filter((artist) => artistIds.includes(artist.id))
		: [];
	if (linked.length === 0) return null;
	if (linked.length === 1) {
		return (
			<ContextMenuItem onSelect={() => onOpenArtist(linked[0].id)}>
				<Users className="h-4 w-4" />
				Go to artist
			</ContextMenuItem>
		);
	}
	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger className="gap-2 [&>svg]:size-4 [&>svg]:shrink-0">
				<Users className="h-4 w-4" />
				Go to artist
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="w-48">
				{linked.map((artist) => (
					<ContextMenuItem
						key={artist.id}
						onSelect={() => onOpenArtist(artist.id)}
					>
						<span className="truncate">{artist.name}</span>
					</ContextMenuItem>
				))}
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}

export function TrackPlaylistsSubmenu({
	track,
	playlists,
	onToggle,
	onNewPlaylist,
}: {
	track: Track;
	playlists: RemotePlaylist[];
	onToggle: (track: Track, playlistId: number, isMember: boolean) => void;
	onNewPlaylist: (track: Track) => void;
}) {
	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger className="gap-2 [&>svg]:size-4 [&>svg]:shrink-0">
				<ListMusic className="h-4 w-4" />
				Playlists
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="w-48">
				<ContextMenuItem onSelect={() => onNewPlaylist(track)}>
					<Plus className="h-4 w-4" />
					New playlist…
				</ContextMenuItem>
				{playlists.length > 0 && <ContextMenuSeparator />}
				{playlists.map((playlist) => {
					const isMember = playlist.trackIds.includes(track.id);
					return (
						<ContextMenuCheckboxItem
							key={playlist.id}
							checked={isMember}
							onSelect={(e) => e.preventDefault()}
							onCheckedChange={() => onToggle(track, playlist.id, isMember)}
						>
							<span className="truncate">{playlist.name}</span>
						</ContextMenuCheckboxItem>
					);
				})}
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}

export function TrackDownloadItem({ track }: { track: Track }) {
	const { activeIds } = useDownloads();
	const running = activeIds.includes(track.id);
	return (
		<ContextMenuItem
			disabled={running}
			onSelect={() => void downloadService.download(track)}
		>
			<Download className="h-4 w-4" />
			{running ? "Downloading…" : "Download"}
		</ContextMenuItem>
	);
}

export function TrackDeleteItem({ onSelect }: { onSelect: () => void }) {
	return (
		<ContextMenuItem
			className="text-destructive focus:text-destructive"
			onSelect={onSelect}
		>
			<Trash2 className="h-4 w-4" />
			Delete from server
		</ContextMenuItem>
	);
}
