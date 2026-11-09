import { useSyncExternalStore } from "react";
import { PlayerController } from "@/player/PlayerController";
import type { PlayerState } from "@/player/types";

export const playerController = new PlayerController();

export function usePlayer(): {
	state: PlayerState;
	controller: PlayerController;
} {
	const state = useSyncExternalStore(
		playerController.subscribe,
		playerController.getSnapshot,
	);
	return { state, controller: playerController };
}
