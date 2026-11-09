import type { UrlImportProgressMessage } from "@/api/types";
import { formatMb } from "@/lib/utils";
import { bun, onBunMessage } from "./rpc";
import { uploadService } from "./UploadService";
import { Store } from "@/lib/store";

const SUPPORTED_HOSTS = [
	"youtube.com",
	"youtu.be",
	"soundcloud.com",
] as const;

export function parseImportUrl(raw: string): string | null {
	const input = raw.trim();
	if (!input) return null;
	let url: URL;
	try {
		url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
	} catch {
		return null;
	}
	const host = url.hostname.toLowerCase();
	const supported = SUPPORTED_HOSTS.some(
		(known) => host === known || host.endsWith(`.${known}`),
	);
	return supported ? url.toString() : null;
}

export type ImportJobStep =
	| "starting"
	| "downloading"
	| "converting"
	| "staging"
	| "error";

export interface ImportJob {
	id: string;
	url: string;
	title: string | null;
	step: ImportJobStep;
	receivedBytes: number;
	totalBytes: number | null;
	error: string | null;
}

export interface ImportsState {
	imports: readonly ImportJob[];
}

export function importPercent(job: ImportJob): number | null {
	return job.step === "downloading" && job.totalBytes
		? Math.min(100, (job.receivedBytes / job.totalBytes) * 100)
		: null;
}

export function importStatusLabel(job: ImportJob): string {
	const percent = importPercent(job);
	switch (job.step) {
		case "starting":
			return "Preparing download…";
		case "downloading":
			return percent === null
				? `Downloading… ${formatMb(job.receivedBytes)}`
				: `Downloading… ${Math.round(percent)}%`;
		case "converting":
			return "Converting to MP3…";
		case "staging":
			return "Almost done…";
		case "error":
			return job.error ?? "Import failed";
	}
}

export class ImportService extends Store<ImportsState> {
	private jobs: ImportJob[] = [];
	protected snapshot: ImportsState = { imports: [] };

	jobFor(url: string): ImportJob | null {
		return this.jobs.find((job) => job.url === url) ?? null;
	}

	async start(url: string): Promise<void> {
		const job: ImportJob = {
			id: crypto.randomUUID(),
			url,
			title: null,
			step: "starting",
			receivedBytes: 0,
			totalBytes: null,
			error: null,
		};
		this.jobs = [
			...this.jobs.filter((old) => old.url !== url || old.step !== "error"),
			job,
		];
		this.emit();
		try {
			const result = await bun.importFromUrl({ importId: job.id, url });
			if (!result.ok) this.fail(job.id, result.error);
		} catch (err) {
			this.fail(
				job.id,
				err instanceof Error ? err.message : "Import failed to start",
			);
		}
	}

	dismiss(jobId: string): void {
		this.jobs = this.jobs.filter((job) => job.id !== jobId);
		this.emit();
	}

	handleProgress(msg: UrlImportProgressMessage): void {
		switch (msg.type) {
			case "progress":
				this.patch(msg.importId, (job) => ({
					...job,
					step: msg.step,
					title: msg.title ?? job.title,
					receivedBytes: msg.receivedBytes ?? job.receivedBytes,
					totalBytes: msg.totalBytes ?? job.totalBytes,
				}));
				break;
			case "staged":
				if (!this.jobs.some((job) => job.id === msg.importId)) {
					void bun.discardStaged({ ids: [msg.staged.id] });
					break;
				}
				uploadService.add([msg.staged], {
					suggestedArtist: msg.artist,
					playWhenReady: true,
				});
				this.dismiss(msg.importId);
				break;
			case "failed":
				this.fail(msg.importId, msg.error);
				break;
		}
	}

	private fail(jobId: string, error: string): void {
		this.patch(jobId, (job) => ({ ...job, step: "error", error }));
	}

	private patch(jobId: string, update: (job: ImportJob) => ImportJob): void {
		if (!this.jobs.some((job) => job.id === jobId)) return;
		this.jobs = this.jobs.map((job) => (job.id === jobId ? update(job) : job));
		this.emit();
	}

	private emit(): void {
		this.publish({ imports: this.jobs });
	}
}

export const importService = new ImportService();

onBunMessage("urlImportProgress", (msg) => {
	importService.handleProgress(msg);
});
