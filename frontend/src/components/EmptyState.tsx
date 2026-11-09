import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
	icon,
	title,
	hint,
	action,
	framed,
}: {
	icon: ReactNode;
	title: ReactNode;
	hint?: string;
	action?: ReactNode;
	framed?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground",
				framed ? "gap-4" : "gap-3",
			)}
		>
			{framed ? (
				<div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed">
					{icon}
				</div>
			) : (
				icon
			)}
			<div className={cn("space-y-1.5", hint && "max-w-sm")}>
				<p className="text-sm">{title}</p>
				{hint && <p className="text-xs leading-relaxed">{hint}</p>}
			</div>
			{action}
		</div>
	);
}
