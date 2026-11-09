import type { ReactNode } from "react";
import { AlertCircle, ArrowUpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function UpdateBanner({
	tone = "info",
	message,
	progress,
	action,
	onDismiss,
}: {
	tone?: "info" | "error";
	message: ReactNode;
	progress?: { receivedBytes: number; totalBytes: number | null };
	action?: { label: string; onClick: () => void };
	onDismiss?: () => void;
}) {
	const Icon = tone === "error" ? AlertCircle : ArrowUpCircle;
	return (
		<div
			className={cn(
				"flex items-center gap-2 border-b px-4 py-2 text-sm",
				tone === "error"
					? "bg-destructive/10 text-destructive"
					: "bg-primary/10",
			)}
		>
			<Icon className="h-4 w-4 shrink-0" />
			<span className="truncate">{message}</span>
			{progress && (
				<Progress
					className="w-40 shrink-0"
					value={
						progress.totalBytes
							? (progress.receivedBytes / progress.totalBytes) * 100
							: null
					}
				/>
			)}
			{action && (
				<Button
					size="sm"
					variant="outline"
					className="ml-auto shrink-0"
					onClick={action.onClick}
				>
					{action.label}
				</Button>
			)}
			{onDismiss && (
				<Button
					size="icon"
					variant="ghost"
					className="h-7 w-7 shrink-0"
					aria-label="Dismiss update hint"
					onClick={onDismiss}
				>
					<X className="h-4 w-4" />
				</Button>
			)}
		</div>
	);
}
