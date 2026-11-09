import { DiscordPanel } from "@/components/DiscordPanel";
import { EqualizerPanel } from "@/components/EqualizerPanel";
import { ProxyPanel } from "@/components/ProxyPanel";
import { UninstallPanel } from "@/components/UninstallPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function SettingsView() {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-3 px-4 py-2.5">
				<h2 className="shrink-0 text-sm font-semibold">Settings</h2>
			</div>
			<Separator />

			<ScrollArea className="min-h-0 flex-1">
				<div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
					<EqualizerPanel />
					<DiscordPanel />
					<ProxyPanel />
					<UninstallPanel />
				</div>
			</ScrollArea>
		</div>
	);
}
