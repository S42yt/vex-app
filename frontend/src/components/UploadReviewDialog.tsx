import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ImagePlus, Loader2, Music } from "lucide-react";
import { artistService } from "@/api/ArtistService";
import { libraryData } from "@/api/LibraryData";
import { uploadService, type StagedUpload } from "@/api/UploadService";
import { ArtistSuggestion } from "@/components/ArtistSuggestion";
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
import { tooLargeMessage } from "@/lib/utils";
import { MAX_IMAGE_BYTES, MAX_NAME_LENGTH } from "@/lib/limits";
import { useStore } from "@/lib/store";

export function UploadReviewDialog() {
	const { staged, reviewedCount } = useStore(uploadService);
	const head = staged[0];
	const hasBatch = head !== undefined;

	const prevHasBatch = useRef(false);
	useEffect(() => {
		if (hasBatch && !prevHasBatch.current) void libraryData.refresh();
		prevHasBatch.current = hasBatch;
	}, [hasBatch]);

	return (
		<Dialog
			open={hasBatch}
			onOpenChange={(open) => {
				if (!open) uploadService.cancelAll();
			}}
		>
			<DialogContent
				className="max-w-lg"
				onInteractOutside={(e) => e.preventDefault()}
			>
				{head && (
					<ReviewForm
						key={head.id}
						item={head}
						position={reviewedCount + 1}
						total={reviewedCount + staged.length}
						remaining={staged.length}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function ReviewForm({
	item,
	position,
	total,
	remaining,
}: {
	item: StagedUpload;
	position: number;
	total: number;
	remaining: number;
}) {
	const suggestion = item.suggestedArtist;
	const [title, setTitle] = useState(item.title);
	// Undefined is the cover Go extracted while staging.
	const [coverBlob, setCoverBlob] = useState<Blob | null | undefined>();
	const [linkArtist, setLinkArtist] = useState(true);
	const [preview, setPreview] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!coverBlob) {
			setPreview(coverBlob === undefined ? item.coverUrl : null);
			return;
		}
		const url = URL.createObjectURL(coverBlob);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [coverBlob, item.coverUrl]);

	const pickCover = (file: File) => {
		const tooLarge = tooLargeMessage(file.size, MAX_IMAGE_BYTES, "image");
		if (tooLarge) {
			setError(tooLarge);
			return;
		}
		setError(null);
		setCoverBlob(file);
	};

	const confirmHead = async (): Promise<boolean> => {
		const trimmed = title.trim();
		if (!trimmed) {
			setError("A title is required.");
			return false;
		}
		const artistIds: number[] = [];
		if (suggestion && linkArtist) {
			setSubmitting(true);
			setError(null);
			const resolved = await artistService.resolveOrCreate(suggestion);
			if (!resolved.ok) {
				setSubmitting(false);
				setError(`${suggestion.name}: ${resolved.error}`);
				return false;
			}
			artistIds.push(resolved.id);
		}
		uploadService.confirm(item.id, { title: trimmed, artistIds, coverBlob });
		return true;
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		void confirmHead();
	};

	return (
		<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
			<DialogHeader>
				<DialogTitle className="flex items-center gap-2">
					Add to library
					{total > 1 && (
						<span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
							Track {position} of {total}
						</span>
					)}
				</DialogTitle>
				<DialogDescription className="truncate">
					{item.fileName}
				</DialogDescription>
			</DialogHeader>

			<div className="flex gap-4">
				<div className="flex shrink-0 flex-col items-center gap-1.5">
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className="group relative h-28 w-28 shrink-0 overflow-hidden rounded-md bg-muted"
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
							onClick={() => setCoverBlob(null)}
							className="text-xs text-muted-foreground transition-colors hover:text-foreground"
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
						}}
					/>
				</div>

				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<label
						htmlFor="upload-title"
						className="text-sm font-medium leading-none"
					>
						Title
					</label>
					<Input
						id="upload-title"
						autoFocus
						maxLength={MAX_NAME_LENGTH}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						disabled={submitting}
					/>
				</div>
			</div>

			{suggestion && (
				<div className="flex flex-col gap-1.5">
					<span className="text-sm font-medium leading-none">Artist</span>
					<ArtistSuggestion
						suggestion={suggestion}
						checked={linkArtist}
						disabled={submitting}
						onCheckedChange={setLinkArtist}
					/>
				</div>
			)}

			{error && (
				<div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					<AlertCircle className="h-4 w-4 shrink-0" />
					<span>{error}</span>
				</div>
			)}

			<DialogFooter className="sm:justify-between">
				<div className="flex gap-2">
					<Button
						type="button"
						variant="ghost"
						disabled={submitting}
						onClick={() => uploadService.skip(item.id)}
					>
						Skip
					</Button>
					{remaining > 1 && (
						<Button
							type="button"
							variant="outline"
							disabled={submitting}
							onClick={() => {
								void confirmHead().then((ok) => {
									if (ok) void uploadService.confirmAll();
								});
							}}
						>
							Upload all {remaining}
						</Button>
					)}
				</div>
				<Button type="submit" disabled={submitting}>
					{submitting && <Loader2 className="h-4 w-4 animate-spin" />}
					{submitting ? "Uploading…" : "Upload"}
				</Button>
			</DialogFooter>
		</form>
	);
}
