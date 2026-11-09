import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ErrorBanner({
	error,
	className,
}: {
	error: string | null;
	className?: string;
}) {
	if (!error) return null;
	return (
		<div
			className={cn(
				"flex items-center gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive",
				className,
			)}
		>
			<AlertCircle className="h-4 w-4 shrink-0" />
			<span className="truncate">{error}</span>
		</div>
	);
}
