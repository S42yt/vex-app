import type { ImportedArtist, StagedFile } from "@/api/types";
import { blobToBase64 } from "@/lib/utils";
import { artistService } from "./ArtistService";
import { bun } from "./rpc";
import { libraryData } from "./LibraryData";
import { libraryService } from "./LibraryService";
import { mutate } from "./mutate";
import { sessionService } from "./SessionService";
import { Store } from "@/lib/store";

export interface UploadItem {
	id: string;
	title: string;
	status: "uploading" | "error";
	error?: string;
}

export type SuggestedArtist = ImportedArtist;

export interface StagedUpload {
	id: string;
	fileName: string;
	title: string;
	coverUrl: string | null;
	suggestedArtist: SuggestedArtist | null;
	playWhenReady: boolean;
}

export interface StageOptions {
	suggestedArtist?: SuggestedArtist;
	playWhenReady?: boolean;
}

export interface UploadState {
	uploads: readonly UploadItem[];
	staged: readonly StagedUpload[];
	reviewedCount: number;
}

export interface ConfirmEdits {
	title: string;
	artistIds: number[];
	// Undefined keeps the staged cover; null drops it.
	coverBlob?: Blob | null;
}

export class UploadService extends Store<UploadState> {
	private items: UploadItem[] = [];
	private staged: StagedUpload[] = [];
	private reviewedCount = 0;
	protected snapshot: UploadState = { uploads: [], staged: [], reviewedCount: 0 };
	private autoPlayed = false;

	constructor() {
		super();
		sessionService.onStatusChange((status) => {
			if (status === "loggedOut") this.cancelAll();
		});
	}

	async pick(): Promise<void> {
		const result = await bun.pickTracks();
		if (!result.ok) {
			this.items.push({
				id: crypto.randomUUID(),
				title: "Add songs",
				status: "error",
				error: result.error,
			});
			this.emit();
			return;
		}
		this.add(result.staged);
	}

	add(files: readonly StagedFile[], options: StageOptions = {}): void {
		if (files.length === 0) return;
		for (const file of files) {
			if (file.error) {
				this.items.push({
					id: crypto.randomUUID(),
					title: file.fileName,
					status: "error",
					error: file.error,
				});
				continue;
			}
			this.staged.push({
				id: file.id,
				fileName: file.fileName,
				title: file.title,
				coverUrl: file.coverUrl ?? null,
				suggestedArtist: options.suggestedArtist ?? null,
				playWhenReady: options.playWhenReady ?? false,
			});
		}
		this.emit();
	}

	confirm(stagedId: string, edits: ConfirmEdits): void {
		const staged = this.staged.find((s) => s.id === stagedId);
		if (!staged) return;
		this.staged = this.staged.filter((s) => s !== staged);
		this.reviewedCount += 1;
		const item: UploadItem = {
			id: crypto.randomUUID(),
			title: edits.title,
			status: "uploading",
		};
		if (!this.items.some((i) => i.status === "uploading")) {
			this.autoPlayed = false;
		}
		this.items.push(item);
		this.settleReviewedCount();
		this.emit();
		void this.upload(item, staged, edits);
	}

	skip(stagedId: string): void {
		if (!this.staged.some((s) => s.id === stagedId)) return;
		this.staged = this.staged.filter((s) => s.id !== stagedId);
		void bun.discardStaged({ ids: [stagedId] });
		this.reviewedCount += 1;
		this.settleReviewedCount();
		this.emit();
	}

	dismiss(id: string): void {
		const item = this.items.find((i) => i.id === id);
		if (!item || item.status !== "error") return;
		this.items = this.items.filter((i) => i !== item);
		this.emit();
	}

	cancelAll(): void {
		if (this.staged.length === 0) return;
		void bun.discardStaged({ ids: this.staged.map((s) => s.id) });
		this.staged = [];
		this.reviewedCount = 0;
		this.emit();
	}

	async confirmAll(): Promise<void> {
		for (const staged of [...this.staged]) {
			let artistIds: number[] = [];
			if (staged.suggestedArtist) {
				const resolved = await artistService.resolveOrCreate(
					staged.suggestedArtist,
				);
				if (resolved.ok) artistIds = [resolved.id];
			}
			this.confirm(staged.id, { title: staged.title, artistIds });
		}
	}

	private settleReviewedCount(): void {
		if (this.staged.length === 0) this.reviewedCount = 0;
	}

	// Go queues confirmed uploads and sends them one at a time.
	private async upload(
		item: UploadItem,
		staged: StagedUpload,
		{ artistIds, coverBlob }: ConfirmEdits,
	): Promise<void> {
		const known = staged.playWhenReady ? libraryService.trackIds() : null;
		const result = await mutate(
			async () =>
				bun.confirmUpload({
					stagedId: staged.id,
					title: item.title,
					artistIds,
					coverBase64: coverBlob && (await blobToBase64(coverBlob)),
				}),
			"Upload failed",
		);
		if (!result.ok) {
			item.status = "error";
			item.error = result.error;
		} else if (await libraryData.refresh()) {
			this.items = this.items.filter((i) => i !== item);
			if (known) this.playLanded(known);
		} else {
			item.status = "error";
			item.error = "Uploaded, but refreshing the library failed.";
		}
		this.emit();
	}

	private playLanded(known: ReadonlySet<string>): void {
		if (this.autoPlayed) return;
		const landed = libraryService.newestSince(known);
		if (!landed) return;
		this.autoPlayed = true;
		libraryService.playTrack(landed.id);
	}

	private emit(): void {
		this.publish({
			uploads: [...this.items],
			staged: [...this.staged],
			reviewedCount: this.reviewedCount,
		});
	}
}

export const uploadService = new UploadService();
