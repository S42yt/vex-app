import { useSyncExternalStore } from "react";
import { playerController } from "@/hooks/usePlayer";
import type { Effects, EffectsState } from "@/player/Effects";

export function useEffects(): {
	state: EffectsState;
	effects: Effects;
} {
	const effects = playerController.effects;
	const state = useSyncExternalStore(effects.subscribe, effects.getSnapshot);
	return { state, effects };
}
