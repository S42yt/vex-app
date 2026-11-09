import { Group, SettingRow, Toggle } from "@/components/SettingsControls";
import { usePresence } from "@/hooks/usePresence";
import { cn } from "@/lib/utils";
import type { PresenceStatus } from "@/api/types";

export function DiscordPanel() {
	const { presence, service } = usePresence();
	const refusal =
		presence.enabled && presence.status.connection === "refused"
			? presence.status.refusal
			: undefined;

	return (
		<Group
			title="Discord Presence"
			description="Show what you're listening to on your Discord profile."
			action={(labelling) => (
				<div className="flex items-center gap-3">
					{presence.enabled && <ConnectionMark status={presence.status} />}
					<Toggle
						checked={presence.enabled}
						onChange={service.setEnabled}
						{...labelling}
					/>
				</div>
			)}
		>
			{refusal && (
				<SettingRow
					label="Discord refused the update"
					hint={`${refusal.code ?? "?"}: ${refusal.message ?? "no detail"}`}
				/>
			)}
		</Group>
	);
}

const MARK_LABELS: Record<PresenceStatus["connection"], string> = {
	offline: "Not connected",
	connected: "Connected",
	refused: "Discord refused",
};

function ConnectionMark({ status }: { status: PresenceStatus }) {
	const live = status.connection === "connected";
	return (
		<span
			className={cn(
				"flex items-center gap-1.5 text-xs",
				live ? "text-foreground" : "text-muted-foreground",
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"h-2 w-2 rounded-full",
					live ? "bg-foreground" : "bg-muted-foreground/40",
				)}
			/>
			{MARK_LABELS[status.connection]}
		</span>
	);
}
