import { Check, UserCheck, UserPlus } from "lucide-react";
import type { SuggestedArtist } from "@/api/UploadService";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useArtists } from "@/hooks/useArtists";
import { findMatchingArtist } from "@/lib/artistMatch";
import { cn } from "@/lib/utils";

export function ArtistSuggestion({
	suggestion,
	checked,
	onCheckedChange,
	disabled,
}: {
	suggestion: SuggestedArtist;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean;
}) {
	const { artists: artistState } = useArtists();
	const matched = findMatchingArtist(suggestion.name, artistState.artists);
	const imageUrl = suggestion.imageBase64
		? `data:${suggestion.imageMime ?? "image/jpeg"};base64,${suggestion.imageBase64}`
		: matched?.imageUrl;

	return (
		<button
			type="button"
			disabled={disabled}
			aria-pressed={checked}
			title={
				matched && matched.name !== suggestion.name
					? `Matches “${matched.name}” in your library`
					: undefined
			}
			onClick={() => onCheckedChange(!checked)}
			className={cn(
				"flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-50",
				checked
					? "border-primary/40 bg-primary/5"
					: "border-input hover:bg-accent",
			)}
		>
			<span
				className={cn(
					"flex h-4 w-4 shrink-0 items-center justify-center rounded border",
					checked
						? "border-primary bg-primary text-primary-foreground"
						: "border-input",
				)}
			>
				{checked && <Check className="h-3 w-3" />}
			</span>
			<ArtistAvatar
				imageUrl={imageUrl}
				className="h-7 w-7"
				iconClassName="h-3.5 w-3.5"
			/>
			<span className="min-w-0 flex-1 truncate">{suggestion.name}</span>
			<span
				className={cn(
					"inline-flex shrink-0 items-center gap-1 text-xs",
					matched ? "text-muted-foreground" : "text-primary",
				)}
			>
				{matched ? (
					<>
						<UserCheck className="h-3.5 w-3.5" />
						In library
					</>
				) : (
					<>
						<UserPlus className="h-3.5 w-3.5" />
						New
					</>
				)}
			</span>
		</button>
	);
}
