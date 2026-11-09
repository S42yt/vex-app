import type { ReactNode } from "react";
import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CollectionCardActions({
	name,
	onEdit,
	onDelete,
}: {
	name: string;
	onEdit: () => void;
	onDelete: () => void;
}) {
	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className="h-7 w-7"
				aria-label={`Edit ${name}`}
				onClick={(e) => {
					e.stopPropagation();
					onEdit();
				}}
			>
				<Pencil className="h-4 w-4" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="h-7 w-7"
				aria-label={`Delete ${name}`}
				onClick={(e) => {
					e.stopPropagation();
					onDelete();
				}}
			>
				<Trash2 className="h-4 w-4" />
			</Button>
		</>
	);
}

export function CollectionCard({
	artwork,
	name,
	meta,
	shape = "square",
	ownsQueue,
	playing,
	playLabel,
	onOpen,
	onPlay,
	actions,
}: {
	artwork: ReactNode;
	name: string;
	meta: string;
	shape?: "square" | "round";
	ownsQueue?: boolean;
	playing?: boolean;
	playLabel: string;
	onOpen: () => void;
	onPlay?: () => void;
	actions?: ReactNode;
}) {
	const round = shape === "round";
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={onOpen}
			onKeyDown={(e) => {
				// Keys on the inner buttons bubble here; without the guard one would also
				// open the collection.
				if (e.target !== e.currentTarget) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen();
				}
			}}
			className="group relative flex cursor-pointer flex-col gap-2 rounded-xl p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
		>
			<div className="relative">
				{artwork}
				{onPlay && (
					<Button
						size="icon"
						className={cn(
							"absolute h-9 w-9 rounded-full shadow-md transition-opacity focus-visible:opacity-100 group-hover:opacity-100",
							round ? "bottom-1 right-1" : "bottom-2 right-2",
							playing ? "opacity-100" : "opacity-0",
						)}
						aria-label={playLabel}
						onClick={(e) => {
							e.stopPropagation();
							onPlay();
						}}
					>
						{playing ? (
							<Pause className="h-4 w-4 fill-current" />
						) : (
							<Play className="h-4 w-4 fill-current" />
						)}
					</Button>
				)}
			</div>
			<div className={cn("min-w-0", round && "text-center")}>
				<p
					className={cn(
						"truncate text-sm font-medium transition-colors",
						ownsQueue && "text-primary",
					)}
				>
					{name}
				</p>
				<p className="truncate text-xs text-muted-foreground">{meta}</p>
			</div>
			{actions && (
				<div className="absolute right-1 top-1 flex rounded-md bg-background/70 opacity-0 backdrop-blur-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
					{actions}
				</div>
			)}
		</div>
	);
}
