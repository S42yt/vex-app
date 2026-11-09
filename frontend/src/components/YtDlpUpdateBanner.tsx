import { memo, useEffect } from "react";
import { UpdateBanner } from "@/components/UpdateBanner";
import { binaryService } from "@/api/BinaryService";
import { useStore } from "@/lib/store";

export const YtDlpUpdateBanner = memo(function YtDlpUpdateBanner() {
	const binaries = useStore(binaryService);

	useEffect(() => {
		void binaryService.checkForUpdate();
	}, []);

	if (binaries.updating) {
		const progress = binaries.updateProgress;
		return (
			<UpdateBanner
				message={
					progress?.step === "extracting"
						? "Installing yt-dlp update…"
						: "Updating yt-dlp…"
				}
				progress={progress ?? { receivedBytes: 0, totalBytes: null }}
			/>
		);
	}

	if (binaries.updateError) {
		return (
			<UpdateBanner
				tone="error"
				message={`yt-dlp update failed: ${binaries.updateError}`}
				action={{ label: "Retry", onClick: () => void binaryService.updateYtDlp() }}
			/>
		);
	}

	if (!binaries.updateAvailable || binaries.updateDismissed) return null;

	return (
		<UpdateBanner
			message={`yt-dlp ${binaries.latestVersion ?? "update"} is available.`}
			action={{ label: "Update", onClick: () => void binaryService.updateYtDlp() }}
			onDismiss={() => binaryService.dismissUpdate()}
		/>
	);
});
