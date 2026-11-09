import { LogOut, RefreshCw } from "lucide-react";
import { libraryData } from "@/api/LibraryData";
import { AddTracksButton } from "@/components/AddTracksButton";
import { HeaderAction } from "@/components/HeaderAction";
import { ImportUrlButton } from "@/components/ImportUrlButton";
import { Logo } from "@/components/Logo";
import { ViewSwitch } from "@/components/ViewSwitch";
import { useLibrary } from "@/hooks/useLibrary";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

export function AppHeader() {
	const { library } = useLibrary();
	const { service: session } = useSession();

	const refresh = () => {
		void libraryData.refresh();
	};

	return (
		<header className="grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto_1fr] items-center gap-4 border-b bg-gradient-to-b from-card to-card/30 px-5">
			<div className="flex min-w-0 items-center gap-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-muted/80 to-muted/20 shadow-sm ring-1 ring-inset ring-border/70">
					<Logo className="h-6 w-6" />
				</div>
				<h1 className="truncate font-wordmark text-xl font-semibold tracking-tight">
					VexWave
				</h1>
			</div>

			<ViewSwitch />

			<div>
				<div className="flex items-center justify-end overflow-hidden">
					<HeaderAction
						icon={<RefreshCw className={cn(library.loading && "animate-spin")} />}
						label="Refresh"
						disabled={library.loading}
						onClick={refresh}
					/>
					<ImportUrlButton />
					<AddTracksButton />
					<HeaderAction
						icon={<LogOut />}
						label="Log out"
						className="hover:bg-destructive/10 hover:text-red-400"
						onClick={() => void session.logout()}
					/>
				</div>
			</div>
		</header>
	);
}
