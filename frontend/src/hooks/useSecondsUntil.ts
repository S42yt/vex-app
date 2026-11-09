import { useEffect, useReducer } from "react";

export function useSecondsUntil(deadline: number | null): number {
	const [, tick] = useReducer((count: number) => count + 1, 0);

	useEffect(() => {
		if (deadline === null) return;
		const id = setInterval(() => {
			tick();
			if (Date.now() >= deadline) clearInterval(id);
		}, 1000);
		return () => clearInterval(id);
	}, [deadline]);

	return deadline === null
		? 0
		: Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}
