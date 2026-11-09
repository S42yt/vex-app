import { memo, useEffect } from "react";
import { UpdateBanner } from "@/components/UpdateBanner";
import { useAppUpdate } from "@/hooks/useAppUpdate";

export const AppUpdateBanner = memo(function AppUpdateBanner() {
	const { update, service } = useAppUpdate();

	useEffect(() => {
		void service.checkForUpdate();
	}, [service]);

	const version = update.latestVersion;
	if (!version) return null;

	if (update.error) {
		return (
			<UpdateBanner
				tone="error"
				message={`VexWave update failed: ${update.error}`}
				action={{ label: "Retry", onClick: () => void service.retry() }}
			/>
		);
	}

	switch (update.phase) {
		case "downloading":
			return (
				<UpdateBanner
					message={`Downloading VexWave ${version}…`}
					progress={update}
				/>
			);
		case "installing":
			return (
				<UpdateBanner message={`Restarting to install VexWave ${version}…`} />
			);
		case "ready":
			return (
				<UpdateBanner
					message={`VexWave ${version} is ready to install.`}
					action={{
						label: "Restart to install",
						onClick: () => void service.install(),
					}}
				/>
			);
		case "idle":
			if (update.dismissed) return null;
			return (
				<UpdateBanner
					message={`VexWave ${version} is available.`}
					action={{ label: "Update", onClick: () => void service.download() }}
					onDismiss={() => service.dismiss()}
				/>
			);
	}
});
