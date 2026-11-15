import { useState, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import { importService, parseImportUrl } from "@/api/ImportService";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function ImportUrlDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [url, setUrl] = useState("");
	const [error, setError] = useState<string | null>(null);

	const close = () => {
		onClose();
		setUrl("");
		setError(null);
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const normalized = parseImportUrl(url);
		if (!normalized) {
			setError("Enter a YouTube or SoundCloud link.");
			return;
		}
		void importService.start(normalized);
		close();
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) close();
			}}
		>
			<DialogContent className="sm:max-w-md">
				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Import from URL</DialogTitle>
						<DialogDescription>
							Downloads the audio from a YouTube or SoundCloud link. You can
							review title, cover and artists before it's added.
						</DialogDescription>
					</DialogHeader>

					<Input
						autoFocus
						type="text"
						placeholder="https://www.youtube.com/watch?v=…"
						value={url}
						onChange={(e) => {
							setUrl(e.target.value);
							setError(null);
						}}
					/>

					{error && (
						<div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
							<AlertCircle className="h-4 w-4 shrink-0" />
							<span>{error}</span>
						</div>
					)}

					<DialogFooter>
						<Button type="submit" disabled={url.trim() === ""}>
							Import
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
