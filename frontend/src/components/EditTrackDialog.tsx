import { useEffect, useRef, useState } from "react";
import { AlertCircle, ImagePlus, Loader2, Music } from "lucide-react";
import {
	libraryService,
	type EditTrackChanges,
} from "@/api/LibraryService";
import { ArtistMultiSelect } from "@/components/ArtistMultiSelect";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { blobToBase64, tooLargeMessage } from "@/lib/utils";
import type { Track } from "@/player/types";
import {
	MAX_ARTISTS_PER_TRACK,
	MAX_IMAGE_BYTES,
	MAX_NAME_LENGTH,
} from "@/lib/limits";
import { artistService } from "@/api/ArtistService";
import { useStore } from "@/lib/store";

type CoverEdit =
	| { kind: "unchanged" }
	| { kind: "new"; file: File }
	| { kind: "removed" };

export function EditTrackDialog({
	track,
	open,
	onOpenChange,
}: {
	track: Track | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const artistState = useStore(artistService);
	const [title, setTitle] = useState("");
	const [cover, setCover] = useState<CoverEdit>({ kind: "unchanged" });
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [initialIds, setInitialIds] = useState<Set<number>>(new Set());
	const [preview, setPreview] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		const linked = new Set(
			track ? libraryService.getRemote(track.id)?.artistIds : [],
		);
		setTitle(track?.title ?? "");
		setCover({ kind: "unchanged" });
		setSelected(new Set(linked));
		setInitialIds(linked);
		setSubmitting(false);
		setError(null);
	}, [open, track]);

	useEffect(() => {
		if (cover.kind === "new") {
			const url = URL.createObjectURL(cover.file);
			setPreview(url);
			return () => URL.revokeObjectURL(url);
		}
		setPreview(cover.kind === "removed" ? null : (track?.coverUrl ?? null));
	}, [cover, track]);

	const toggle = (id: number) => {
		if (!selected.has(id) && selected.size >= MAX_ARTISTS_PER_TRACK) {
			setError(`A track can name at most ${MAX_ARTISTS_PER_TRACK} artists.`);
			return;
		}
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const pickCover = (file: File) => {
		const tooLarge = tooLargeMessage(file.size, MAX_IMAGE_BYTES, "image");
		if (tooLarge) {
			setError(tooLarge);
			return;
		}
		setError(null);
		setCover({ kind: "new", file });
	};

	const removeCover = () => {
		setCover(track?.coverUrl ? { kind: "removed" } : { kind: "unchanged" });
	};

	const sameSet = (a: Set<number>, b: Set<number>) =>
		a.size === b.size && [...a].every((id) => b.has(id));

	const handleSave = async () => {
		if (!track) return;
		const trimmed = title.trim();
		const changes: EditTrackChanges = {};
		if (trimmed !== track.title) changes.title = trimmed;
		if (!sameSet(selected, initialIds)) changes.artistIds = [...selected];
		if (cover.kind === "removed") changes.coverBase64 = null;
		else if (cover.kind === "new") {
			try {
				changes.coverBase64 = await blobToBase64(cover.file);
			} catch {
				setError("Could not read the selected image.");
				return;
			}
		}

		if (Object.keys(changes).length === 0) {
			onOpenChange(false);
			return;
		}

		setSubmitting(true);
		setError(null);
		const result = await libraryService.editTrack(track.id, changes);
		setSubmitting(false);
		if (result.ok) onOpenChange(false);
		else setError(result.error);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit track</DialogTitle>
					<DialogDescription className="truncate">
						{track ? `Editing “${track.title}”` : ""}
					</DialogDescription>
				</DialogHeader>

				<div className="flex gap-4">
					<div className="flex shrink-0 flex-col items-center gap-1.5">
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={submitting}
							className="group relative h-28 w-28 shrink-0 overflow-hidden rounded-md bg-muted disabled:opacity-50"
							aria-label="Choose cover image"
						>
							{preview ? (
								<img
									src={preview}
									alt=""
									className="h-full w-full object-cover"
								/>
							) : (
								<Music className="absolute inset-0 m-auto h-9 w-9 text-muted-foreground" />
							)}
							<span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
								<ImagePlus className="h-6 w-6 text-white" />
							</span>
						</button>
						{preview && (
							<button
								type="button"
								onClick={removeCover}
								disabled={submitting}
								className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
							>
								Remove
							</button>
						)}
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) pickCover(file);
								e.target.value = "";
							}}
						/>
					</div>

					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<label
							htmlFor="edit-title"
							className="text-sm font-medium leading-none"
						>
							Title
						</label>
						<Input
							id="edit-title"
							autoFocus
							maxLength={MAX_NAME_LENGTH}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							disabled={submitting}
						/>
					</div>
				</div>

				<div className="flex flex-col gap-1.5">
					<span className="text-sm font-medium leading-none">Artists</span>
					<ArtistMultiSelect
						artists={artistState.artists}
						selected={selected}
						onToggle={toggle}
						disabled={submitting}
						className="max-h-48"
					/>
					<span className="text-xs text-muted-foreground">
						{selected.size} selected
					</span>
				</div>

				{error && (
					<div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
						<AlertCircle className="h-4 w-4 shrink-0" />
						<span>{error}</span>
					</div>
				)}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => void handleSave()}
						disabled={submitting || title.trim() === ""}
					>
						{submitting && <Loader2 className="h-4 w-4 animate-spin" />}
						{submitting ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
