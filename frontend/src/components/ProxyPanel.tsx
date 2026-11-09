import { useState, type FormEvent } from "react";
import { Group, SettingRow } from "@/components/SettingsControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSecondsUntil } from "@/hooks/useSecondsUntil";
import { useSession } from "@/hooks/useSession";
import {
	INVALID_PROXY_MESSAGE,
	PROXY_PLACEHOLDER,
	parseProxyUrl,
} from "@/lib/urls";
import { formatTime } from "@/lib/utils";

export function ProxyPanel() {
	const { session, service } = useSession();
	const [address, setAddress] = useState(session.proxyUrl);
	const [invalid, setInvalid] = useState(false);
	const waitSec = useSecondsUntil(session.proxyRetryAfter);
	const saving = session.savingProxy;
	const unchanged = parseProxyUrl(address) === session.proxyUrl;
	const error = invalid ? INVALID_PROXY_MESSAGE : session.proxyError;

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const proxyUrl = parseProxyUrl(address);
		if (proxyUrl === null) {
			setInvalid(true);
			return;
		}
		void service.setProxy(proxyUrl);
	};

	return (
		<Group
			title="Proxy"
			description="Used for the server, search, imports and yt-dlp updates."
		>
			<form className="flex items-center gap-3 px-4 py-3" onSubmit={handleSubmit}>
				<Input
					aria-label="Proxy address"
					placeholder={PROXY_PLACEHOLDER}
					value={address}
					onChange={(e) => {
						setAddress(e.target.value);
						setInvalid(false);
					}}
					disabled={saving}
				/>
				<Button type="submit" disabled={saving || unchanged || waitSec > 0}>
					{saving
						? "Checking…"
						: waitSec > 0
							? `Try again in ${formatTime(waitSec)}`
							: "Save"}
				</Button>
			</form>
			{error && <SettingRow label="Proxy not saved" hint={error} />}
		</Group>
	);
}
