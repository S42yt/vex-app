import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Group } from "@/components/SettingsControls";
import { Button } from "@/components/ui/button";
import { useUninstall } from "@/hooks/useUninstall";

export function UninstallPanel() {
	const { uninstall, service } = useUninstall();
	const [confirming, setConfirming] = useState(false);

	useEffect(() => {
		void service.check();
	}, [service]);

	if (!uninstall.removable) return null;

	return (
		<>
			<Group
				title="Uninstall"
				description={uninstall.error ?? "Take VexWave off this computer."}
				action={(labelling) => (
					<Button
						variant="destructive"
						size="sm"
						disabled={uninstall.running}
						onClick={() => setConfirming(true)}
						{...labelling}
					>
						{uninstall.running ? "Closing…" : "Delete VexWave"}
					</Button>
				)}
			/>

			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title="Delete VexWave?"
				description="This removes the player, everything it downloaded to run (its browser engine, yt-dlp and ffmpeg) and its shortcuts, then closes. Your library stays on the server."
				confirmLabel="Delete VexWave"
				onConfirm={() => void service.uninstall()}
			/>
		</>
	);
}
