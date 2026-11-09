import { libraryService } from "@/api/LibraryService";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Track } from "@/player/types";

export function DeleteTrackDialog({
	track,
	open,
	onOpenChange,
}: {
	track: Track | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<ConfirmDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Delete track?"
			description={`Permanently deletes “${track?.title}” from the server.`}
			onConfirm={() => {
				if (track) void libraryService.removeTrack(track.id);
			}}
		/>
	);
}
