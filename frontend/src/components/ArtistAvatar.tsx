import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function ArtistAvatar({
	imageUrl,
	initial,
	className,
	iconClassName,
}: {
	imageUrl?: string;
	initial?: string;
	className?: string;
	iconClassName?: string;
}) {
	return (
		<span
			className={cn(
				"relative block shrink-0 overflow-hidden rounded-full bg-muted",
				className,
			)}
		>
			{imageUrl ? (
				<img src={imageUrl} alt="" className="h-full w-full object-cover" />
			) : initial ? (
				<span className="absolute inset-0 flex items-center justify-center font-semibold uppercase leading-none text-muted-foreground">
					{initial}
				</span>
			) : (
				<Users
					className={cn(
						"absolute inset-0 m-auto text-muted-foreground",
						iconClassName ?? "h-8 w-8",
					)}
				/>
			)}
		</span>
	);
}
