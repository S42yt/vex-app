import {
	MAX_AUDIO_BYTES,
	MAX_DURATION_MS,
	MAX_NAME_LENGTH,
} from "@/lib/limits";
import type { ImportedArtist } from "@/api/types";
import { blobToBase64, tooLargeMessage } from "@/lib/utils";
import { artistService } from "./ArtistService";
import { bun } from "./rpc";
import { libraryData } from "./LibraryData";
import { libraryService } from "./LibraryService";
import { sessionService } from "./SessionService";

export interface UploadItem {
	id: string;
	title: string;
	status: "uploading" | "error";
	error?: string;
}

export type SuggestedArtist = ImportedArtist;

export interface StagedUpload {
	id: string;
	file: File;
	fileName: string;
	title: string;
	durationMs: number;
	coverBlob: Blob | null;
	suggestedArtist: SuggestedArtist | null;
	playWhenReady: boolean;
}

export interface EnqueueOptions {
	suggestedArtist?: SuggestedArtist;
	playWhenReady?: boolean;
}

export interface UploadState {
	uploads: readonly UploadItem[];
	staged: readonly StagedUpload[];
	reviewedCount: number;
}

interface QueueEntry {
	item: UploadItem;
	file: File;
	durationMs: number;
	coverBlob: Blob | null;
	artistIds: number[];
	playWhenReady: boolean;
}

export interface ConfirmEdits {
	title: string;
	artistIds: number[];
	coverBlob: Blob | null;
}

export class UploadService {
	private subscribers = new Set<() => void>();
	private items: UploadItem[] = [];
	private staged: StagedUpload[] = [];
	private reviewedCount = 0;
	private snapshot: UploadState = { uploads: [], staged: [], reviewedCount: 0 };
	private queue: QueueEntry[] = [];
	private working = false;
	private autoPlayed = false;

	constructor() {
		let previousStatus = sessionService.getSnapshot().status;
		sessionService.subscribe(() => {
			const status = sessionService.getSnapshot().status;
			if (status === previousStatus) return;
			previousStatus = status;
			if (status === "loggedOut") this.cancelAll();
		});
	}

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): UploadState => this.snapshot;

	async enqueue(
		files: Iterable<File>,
		options: EnqueueOptions = {},
	): Promise<void> {
		const audioFiles = [...files].filter(
			(file) => file.type.startsWith("audio/") || file.type === "video/mp4",
		);
		if (audioFiles.length === 0) return;
		for (const file of audioFiles) {
			const tooLarge = tooLargeMessage(file.size, MAX_AUDIO_BYTES, "track");
			if (tooLarge) {
				this.items.push({
					id: crypto.randomUUID(),
					title: file.name,
					status: "error",
					error: tooLarge,
				});
				this.emit();
				continue;
			}
			this.staged.push({
				id: crypto.randomUUID(),
				file,
				fileName: file.name,
				title: clampTitle(file.name.replace(/\.[^.]+$/, "")),
				durationMs: clampDuration(undefined),
				coverBlob: null,
				suggestedArtist: options.suggestedArtist ?? null,
				playWhenReady: options.playWhenReady ?? false,
			});
			this.emit();
		}
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
		this.items.push(item);
		this.queue.push({
			item,
			file: staged.file,
			durationMs: staged.durationMs,
			coverBlob: edits.coverBlob,
			artistIds: edits.artistIds,
			playWhenReady: staged.playWhenReady,
		});
		this.settleReviewedCount();
		this.emit();
		void this.work();
	}

	skip(stagedId: string): void {
		if (!this.staged.some((s) => s.id === stagedId)) return;
		this.staged = this.staged.filter((s) => s.id !== stagedId);
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
			this.confirm(staged.id, {
				title: staged.title,
				artistIds,
				coverBlob: staged.coverBlob,
			});
		}
	}

	private settleReviewedCount(): void {
		if (this.staged.length === 0) this.reviewedCount = 0;
	}

	private async work(): Promise<void> {
		if (this.working) return;
		this.working = true;
		this.autoPlayed = false;
		try {
			let entry: QueueEntry | undefined;
			while ((entry = this.queue.shift())) {
				await this.upload(entry);
			}
		} finally {
			this.working = false;
		}
	}

	private async upload(entry: QueueEntry): Promise<void> {
		const { item, file, durationMs, coverBlob, artistIds, playWhenReady } =
			entry;
		const known = playWhenReady ? libraryService.trackIds() : null;
		try {
			const result = await bun.uploadTrack({
				title: item.title,
				durationMs,
				dataBase64: await blobToBase64(file),
				coverBase64: coverBlob ? await blobToBase64(coverBlob) : undefined,
				artistIds,
			});
			if (result.ok) {
				if (await libraryData.refresh()) {
					this.items = this.items.filter((i) => i !== item);
					if (known) this.playLanded(known);
				} else {
					item.status = "error";
					item.error = "Uploaded, but refreshing the library failed.";
				}
			} else {
				item.status = "error";
				item.error = result.error;
				if (result.status === 401) {
					sessionService.markExpired(
						"Session expired — please log in again.",
					);
				}
			}
		} catch (err) {
			item.status = "error";
			item.error = err instanceof Error ? err.message : "Upload failed";
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
		this.snapshot = {
			uploads: [...this.items],
			staged: [...this.staged],
			reviewedCount: this.reviewedCount,
		};
		this.subscribers.forEach((notify) => notify());
	}
}

function clampTitle(title: string): string {
	return title.trim().slice(0, MAX_NAME_LENGTH) || "Untitled";
}

function clampDuration(seconds: number | undefined): number {
	const ms = Math.round((seconds ?? 0) * 1000);
	if (!Number.isFinite(ms) || ms < 0) return 0;
	return Math.min(ms, MAX_DURATION_MS);
}

export const uploadService = new UploadService();
