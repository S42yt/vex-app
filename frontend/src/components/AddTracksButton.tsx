import { Plus } from "lucide-react";
import { uploadService } from "@/api/UploadService";
import { HeaderAction } from "@/components/HeaderAction";

export function AddTracksButton() {
	return (
		<HeaderAction
			icon={<Plus />}
			label="Add songs"
			onClick={() => void uploadService.pick()}
		/>
	);
}
