import { useCallback, useMemo, useState } from "react";
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ListMusic, ListPlus, Pencil } from "lucide-react";
import { libraryService } from "@/api/LibraryService";
import { navigationService } from "@/api/NavigationService";
import { playlistQueueContext, playlistService } from "@/api/PlaylistService";
import { AddTracksDialog } from "@/components/AddTracksDialog";
import { CollectionHeader } from "@/components/CollectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PlaylistCover } from "@/components/PlaylistCover";
import { PlaylistTrackRow } from "@/components/PlaylistTrackRow";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useArtists } from "@/hooks/useArtists";
import { useLibrary } from "@/hooks/useLibrary";
import { usePlayer } from "@/hooks/usePlayer";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTrackActions } from "@/hooks/useTrackActions";
import { formatTime, trackCountLabel } from "@/lib/utils";
import type { RemotePlaylist } from "@/api/types";

const POINTER_OPTIONS = { activationConstraint: { distance: 4 } };
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

export function PlaylistDetail({
	playlist,
	onBack,
	onEdit,
}: {
	playlist: RemotePlaylist;
	onBack: () => void;
	onEdit: () => void;
}) {
	const { state } = usePlayer();
	const { library } = useLibrary();
	const { playlists } = usePlaylists();
	const { artists } = useArtists();
	const [addOpen, setAddOpen] = useState(false);
	const actions = useTrackActions();

	const rows = useMemo(
		() =>
			playlist.trackIds.flatMap((serverId, position) => {
				const track = libraryService.getTrack(serverId);
				return track ? [{ track, serverId, position }] : [];
			}),
		[playlist, library.tracks],
	);

	const playRow = useCallback(
		(rowIndex: number) => playlistService.play(playlist, rowIndex),
		[playlist],
	);
	const moveRow = useCallback(
		(serverId: string, direction: -1 | 1) =>
			playlistService.moveTrack(playlist.id, serverId, direction),
		[playlist.id],
	);
	const removeRow = useCallback(
		(serverId: string) =>
			void playlistService.removeTracks(playlist.id, [serverId]),
		[playlist.id],
	);

	const sensors = useSensors(
		useSensor(PointerSensor, POINTER_OPTIONS),
		useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
	);
	const sortableIds = useMemo(() => rows.map((row) => row.serverId), [rows]);
	const handleDragEnd = useCallback(
		({ active, over }: DragEndEvent) => {
			if (!over || active.id === over.id) return;
			playlistService.reorderTrack(
				playlist.id,
				String(active.id),
				String(over.id),
			);
		},
		[playlist.id],
	);

	const totalSec = useMemo(
		() => rows.reduce((sum, row) => sum + row.track.durationSec, 0),
		[rows],
	);
	const ownsQueue = state.queueContextId === playlistQueueContext(playlist.id);
	const playing = ownsQueue && state.isPlaying;

	return (
		<div className="flex h-full flex-col">
			<CollectionHeader
				onBack={onBack}
				parentLabel="Playlists"
				artwork={
					<PlaylistCover
						playlist={playlist}
						tracks={rows.map((row) => row.track)}
						className="h-16 w-16 shrink-0"
						iconClassName="h-7 w-7"
					/>
				}
				title={playlist.name}
				meta={`${trackCountLabel(rows.length)}${
					rows.length > 0 ? ` · ${formatTime(totalSec)}` : ""
				}`}
				playing={playing}
				playLabel={
					playing ? `Pause ${playlist.name}` : `Play ${playlist.name}`
				}
				playDisabled={rows.length === 0}
				onPlay={() => playlistService.playOrToggle(playlist)}
				actions={
					<>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8"
							aria-label={`Edit ${playlist.name}`}
							onClick={onEdit}
						>
							<Pencil className="h-4 w-4" />
						</Button>
						<Button
							variant="secondary"
							size="sm"
							className="rounded-full px-4"
							onClick={() => setAddOpen(true)}
						>
							<ListPlus className="h-4 w-4" />
							Add tracks
						</Button>
					</>
				}
			/>

			<ErrorBanner error={playlists.error} className="border-b" />

			{rows.length === 0 ? (
				<EmptyState
					icon={<ListMusic className="h-12 w-12" />}
					title="This playlist is empty — add tracks from the library."
				/>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						modifiers={[restrictToVerticalAxis, restrictToParentElement]}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={sortableIds}
							strategy={verticalListSortingStrategy}
						>
							<ul className="flex flex-col gap-1 p-2">
								{rows.map(({ track, serverId, position }, rowIndex) => {
									const isCurrent =
										ownsQueue && track.id === state.currentTrack?.id;
									return (
										<PlaylistTrackRow
											key={track.id}
											track={track}
											rowIndex={rowIndex}
											serverId={serverId}
											artistIds={libraryService.getRemote(track.id)?.artistIds}
											artists={artists.artists}
											isCurrent={isCurrent}
											showBars={isCurrent && state.isPlaying}
											canMoveUp={position > 0}
											canMoveDown={position < playlist.trackIds.length - 1}
											onPlay={playRow}
											onEdit={actions.edit}
											onMove={moveRow}
											onRemove={removeRow}
											onDelete={actions.remove}
											onOpenArtist={navigationService.openArtist}
										/>
									);
								})}
							</ul>
						</SortableContext>
					</DndContext>
				</ScrollArea>
			)}

			<AddTracksDialog
				playlist={playlist}
				open={addOpen}
				onOpenChange={setAddOpen}
			/>

			{actions.dialogs}
		</div>
	);
}
