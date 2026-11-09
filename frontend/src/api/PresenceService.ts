import { playerController } from "@/player/PlayerController";
import { storage } from "@/lib/storage";
import type { PlayerState } from "@/player/types";
import type { PresenceStatus, PresenceTrack } from "@/api/types";
import { bun, notifyBun, onBunMessage } from "./rpc";
import { Store } from "@/lib/store";

const DRIFT_TOLERANCE_SEC = 2;

export interface PresenceState {
	enabled: boolean;
	status: PresenceStatus;
}

export class PresenceService extends Store<PresenceState> {
	protected snapshot: PresenceState = {
		enabled: storage.discord.presenceEnabled.get() ?? true,
		status: { connection: "offline" },
	};
	private sent: PresenceTrack | null = null;
	private sentAt = 0;

	start(): void {
		void this.announce(this.snapshot.enabled);
		this.publishNow();
		playerController.subscribe(() => {
			if (!this.snapshot.enabled) return;
			const next = presenceFor(playerController.getSnapshot());
			if (this.hasChanged(next)) this.push(next);
		});
	}

	setEnabled = (enabled: boolean): void => {
		if (enabled === this.snapshot.enabled) return;
		storage.discord.presenceEnabled.set(enabled);
		this.update({ enabled });
		void this.announce(enabled);
		this.sent = null;
		if (enabled) this.publishNow();
	};

	handleStatus(status: PresenceStatus): void {
		this.update({ status });
	}

	private async announce(enabled: boolean): Promise<void> {
		try {
			this.update({ status: await bun.setPresenceEnabled({ enabled }) });
		} catch (err) {
			this.update({ status: { connection: "offline" } });
			console.error("Discord presence: bun never took the setting.", err);
		}
	}

	private publishNow(): void {
		if (!this.snapshot.enabled) return;
		this.push(presenceFor(playerController.getSnapshot()));
	}

	private push(next: PresenceTrack | null): void {
		this.sent = next;
		this.sentAt = Date.now();
		notifyBun.presenceChanged({ track: next });
	}

	private hasChanged(next: PresenceTrack | null): boolean {
		if (!next || !this.sent) return next !== this.sent;
		if (
			next.id !== this.sent.id ||
			next.title !== this.sent.title ||
			next.artist !== this.sent.artist ||
			next.hasCover !== this.sent.hasCover ||
			next.durationSec !== this.sent.durationSec
		) {
			return true;
		}
		const expectedSec =
			this.sent.positionSec + (Date.now() - this.sentAt) / 1000;
		return Math.abs(next.positionSec - expectedSec) > DRIFT_TOLERANCE_SEC;
	}
}

function presenceFor(state: PlayerState): PresenceTrack | null {
	const track = state.currentTrack;
	if (!track || !state.isPlaying) return null;
	return {
		id: track.id,
		title: track.title,
		artist: track.artist,
		hasCover: track.coverUrl !== undefined,
		positionSec: Math.round(state.currentTimeSec),
		durationSec: Math.round(state.durationSec),
	};
}

export const presenceService = new PresenceService();

onBunMessage("presenceStatus", (status) => {
	presenceService.handleStatus(status);
});
