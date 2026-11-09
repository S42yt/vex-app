import { AlertCircle, Link2, Loader2, Music, X } from "lucide-react";
import {
	importPercent,
	importService,
	importStatusLabel,
} from "@/api/ImportService";
import { uploadService } from "@/api/UploadService";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImportJob } from "@/api/ImportService";
import type { UploadItem } from "@/api/UploadService";

export function PendingUploadRow({ upload }: { upload: UploadItem }) {
	const failed = upload.status === "error";
	return (
		<div className="flex w-full items-center gap-3 rounded-lg py-2 pl-3 pr-2.5 text-left opacity-80">
			<span className="w-5 shrink-0" aria-hidden="true" />
			<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-inset ring-border/60">
				<Music className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{upload.title}</p>
				<p
					className={cn(
						"truncate text-xs text-muted-foreground",
						failed && "text-destructive",
					)}
				>
					{failed ? (upload.error ?? "Upload failed") : "Uploading to server…"}
				</p>
			</div>
			{failed ? (
				<>
					<AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
						aria-label="Dismiss failed upload"
						onClick={() => uploadService.dismiss(upload.id)}
					>
						<X className="h-4 w-4" />
					</Button>
				</>
			) : (
				<Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
			)}
		</div>
	);
}

export function PendingImportRow({ job }: { job: ImportJob }) {
	const failed = job.step === "error";
	const percent = importPercent(job);
	return (
		<div className="flex w-full items-center gap-3 rounded-lg py-2 pl-3 pr-2.5 text-left opacity-80">
			<span className="w-5 shrink-0" aria-hidden="true" />
			<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-inset ring-border/60">
				<Link2 className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{job.title ?? job.url}</p>
				<p
					className={cn(
						"truncate text-xs text-muted-foreground",
						failed && "text-destructive",
					)}
				>
					{importStatusLabel(job)}
				</p>
				{percent !== null && (
					<div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary transition-[width] duration-200"
							style={{ width: `${percent}%` }}
						/>
					</div>
				)}
			</div>
			{failed ? (
				<>
					<AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
						aria-label="Dismiss failed import"
						onClick={() => importService.dismiss(job.id)}
					>
						<X className="h-4 w-4" />
					</Button>
				</>
			) : (
				<Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
			)}
		</div>
	);
}
