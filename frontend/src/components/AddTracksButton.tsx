import { useRef } from "react";
import { Plus } from "lucide-react";
import { uploadService } from "@/api/UploadService";
import { HeaderAction } from "@/components/HeaderAction";

export function AddTracksButton() {
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFiles = (files: FileList | null) => {
		if (!files || files.length === 0) return;
		uploadService.enqueue(files);
	};

	return (
		<>
			<input
				ref={inputRef}
				type="file"
				accept="audio/*"
				multiple
				className="hidden"
				onChange={(e) => {
					handleFiles(e.target.files);
					e.target.value = "";
				}}
			/>
			<HeaderAction
				icon={<Plus />}
				label="Add songs"
				onClick={() => inputRef.current?.click()}
			/>
		</>
	);
}
