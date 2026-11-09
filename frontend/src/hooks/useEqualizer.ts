import { useSyncExternalStore } from "react";
import { playerController } from "@/hooks/usePlayer";
import type { Equalizer, EqualizerState } from "@/player/Equalizer";

export function useEqualizer(): {
	state: EqualizerState;
	equalizer: Equalizer;
} {
	const equalizer = playerController.equalizer;
	const state = useSyncExternalStore(
		equalizer.subscribe,
		equalizer.getSnapshot,
	);
	return { state, equalizer };
}
