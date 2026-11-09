import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import {
	TrackArtistItems,
	TrackDeleteItem,
	TrackDownloadItem,
	TrackEditItem,
} from "@/components/TrackMenuItems";
import { TrackRow } from "@/components/TrackRow";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { RemoteArtist } from "@/api/types";
import type { Track } from "@/player/types";

export const PlaylistTrackRow = memo(function PlaylistTrackRow({
	track,
	rowIndex,
	serverId,
	artistIds,
	artists,
	isCurrent,
	showBars,
	canMoveUp,
	canMoveDown,
	onPlay,
	onEdit,
	onMove,
	onRemove,
	onDelete,
	onOpenArtist,
}: {
	track: Track;
	rowIndex: number;
	serverId: string;
	artistIds: readonly number[] | undefined;
	artists: RemoteArtist[];
	isCurrent: boolean;
	showBars: boolean;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onPlay: (rowIndex: number) => void;
	onEdit: (track: Track) => void;
	onMove: (serverId: string, direction: -1 | 1) => void;
	onRemove: (serverId: string) => void;
	onDelete: (track: Track) => void;
	onOpenArtist: (artistId: number) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: serverId });

	return (
		<li
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
			}}
			className={cn(
				"rounded-lg",
				isDragging && "relative z-10 bg-accent shadow-lg ring-1 ring-border",
			)}
		>
			<TrackRow
				track={track}
				position={rowIndex + 1}
				isCurrent={isCurrent}
				showBars={showBars}
				onPlay={() => onPlay(rowIndex)}
				menuClassName="w-52"
				dragHandle={
					<button
						ref={setActivatorNodeRef}
						type="button"
						aria-label={`Reorder ${track.title}`}
						className={cn(
							"-mr-1.5 flex h-7 w-5 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							isDragging && "cursor-grabbing text-foreground",
						)}
						// The row plays on click; a grip pressed but not dragged must not count
						// as one.
						onClick={(e) => e.stopPropagation()}
						{...attributes}
						{...listeners}
					>
						<GripVertical className="h-4 w-4" />
					</button>
				}
				menu={
					<>
						<TrackEditItem onSelect={() => onEdit(track)} />
						<TrackArtistItems
							artistIds={artistIds}
							artists={artists}
							onOpenArtist={onOpenArtist}
						/>
						<TrackDownloadItem track={track} />
						<ContextMenuSeparator />
						<ContextMenuItem
							disabled={!canMoveUp}
							onSelect={() => onMove(serverId, -1)}
						>
							<ArrowUp className="h-4 w-4" />
							Move up
						</ContextMenuItem>
						<ContextMenuItem
							disabled={!canMoveDown}
							onSelect={() => onMove(serverId, 1)}
						>
							<ArrowDown className="h-4 w-4" />
							Move down
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={() => onRemove(serverId)}>
							<X className="h-4 w-4" />
							Remove from playlist
						</ContextMenuItem>
						<ContextMenuSeparator />
						<TrackDeleteItem onSelect={() => onDelete(track)} />
					</>
				}
			/>
		</li>
	);
});
