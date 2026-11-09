import { useEffect, useMemo, useState } from "react";
import { ListMusic, Loader2, Plus } from "lucide-react";
import { navigationService, openIdOf } from "@/api/NavigationService";
import { playlistQueueContext, playlistService } from "@/api/PlaylistService";
import {
	CollectionCard,
	CollectionCardActions,
} from "@/components/CollectionCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PlaylistCover } from "@/components/PlaylistCover";
import { PlaylistDetail } from "@/components/PlaylistDetail";
import { PlaylistDialog } from "@/components/PlaylistDialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { trackCountLabel } from "@/lib/utils";
import type { RemotePlaylist } from "@/api/types";
import { libraryService } from "@/api/LibraryService";
import { useStore } from "@/lib/store";
import { playerController } from "@/player/PlayerController";

export function PlaylistsView() {
	const state = useStore(playlistService);
	const view = useStore(navigationService);
	const playerState = useStore(playerController);
	const library = useStore(libraryService);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<RemotePlaylist | null>(null);
	const [pendingDelete, setPendingDelete] = useState<RemotePlaylist | null>(
		null,
	);

	const openCreate = () => {
		setEditing(null);
		setDialogOpen(true);
	};
	const openEdit = (playlist: RemotePlaylist) => {
		setEditing(playlist);
		setDialogOpen(true);
	};

	const tracksByPlaylist = useMemo(
		() =>
			new Map(
				state.playlists.map((playlist) => [
					playlist.id,
					playlistService.tracksOf(playlist),
				]),
			),
		[state.playlists, library.tracks],
	);

	const openId = openIdOf(view);
	const open =
		openId !== null
			? (state.playlists.find((playlist) => playlist.id === openId) ?? null)
			: null;

	useEffect(() => {
		if (openId !== null && open === null) navigationService.openPlaylist(null);
	}, [openId, open, navigation]);

	const firstLoad = state.loading && state.playlists.length === 0;

	return (
		<div className="flex h-full flex-col">
			{open ? (
				<PlaylistDetail
					playlist={open}
					onBack={() => navigationService.openPlaylist(null)}
					onEdit={() => openEdit(open)}
				/>
			) : (
				<>
					<div className="flex items-center gap-3 px-4 py-2.5">
						<h2 className="shrink-0 text-sm font-semibold">Playlists</h2>
						<Button
							variant="secondary"
							size="sm"
							className="ml-auto"
							onClick={openCreate}
						>
							<Plus className="h-4 w-4" />
							New playlist
						</Button>
					</div>
					<Separator />

					<ErrorBanner error={state.error} className="border-b" />

					{firstLoad ? (
						<div className="flex flex-1 items-center justify-center text-muted-foreground">
							<Loader2 className="h-6 w-6 animate-spin" />
						</div>
					) : state.playlists.length === 0 ? (
						<EmptyState
							framed
							icon={<ListMusic className="h-9 w-9" />}
							title="No playlists yet — create one to get started."
						/>
					) : (
						<ScrollArea className="min-h-0 flex-1">
							<ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-4">
								{state.playlists.map((playlist) => {
									const tracks = tracksByPlaylist.get(playlist.id) ?? [];
									const ownsQueue =
										playerState.queueContextId ===
										playlistQueueContext(playlist.id);
									const playing = ownsQueue && playerState.isPlaying;
									return (
										<li key={playlist.id}>
											<CollectionCard
												artwork={
													<PlaylistCover
														playlist={playlist}
														tracks={tracks}
														className="aspect-square w-full"
													/>
												}
												name={playlist.name}
												meta={trackCountLabel(tracks.length)}
												ownsQueue={ownsQueue}
												playing={playing}
												playLabel={
													playing
														? `Pause ${playlist.name}`
														: `Play ${playlist.name}`
												}
												onOpen={() => navigationService.openPlaylist(playlist.id)}
												onPlay={
													tracks.length > 0
														? () => playlistService.playOrToggle(playlist)
														: undefined
												}
												actions={
													<CollectionCardActions
														name={playlist.name}
														onEdit={() => openEdit(playlist)}
														onDelete={() => setPendingDelete(playlist)}
													/>
												}
											/>
										</li>
									);
								})}
							</ul>
						</ScrollArea>
					)}
				</>
			)}

			<PlaylistDialog
				playlist={editing}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
			/>

			<ConfirmDialog
				open={pendingDelete !== null}
				onOpenChange={(next) => {
					if (!next) setPendingDelete(null);
				}}
				title="Delete playlist?"
				description={`Removes “${pendingDelete?.name}” from the server. Its tracks stay in the library.`}
				onConfirm={() => {
					if (!pendingDelete) return;
					void playlistService.remove(pendingDelete.id);
					if (openId === pendingDelete.id) navigationService.openPlaylist(null);
				}}
			/>
		</div>
	);
}
