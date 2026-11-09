import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useAudioGlow } from "@/hooks/useAudioGlow";
import { cn } from "@/lib/utils";
import type { PlayerController } from "@/player/PlayerController";

const FADE_MS = 700;

type CoverLayer = { id: number; url: string; loaded: boolean };

function topLayer(layers: CoverLayer[]): CoverLayer | undefined {
	return layers[layers.length - 1] as CoverLayer | undefined;
}

export const CoverBackdrop = memo(function CoverBackdrop({
	coverUrl,
	controller,
	isPlaying,
}: {
	coverUrl: string | undefined;
	controller: PlayerController;
	isPlaying: boolean;
}) {
	const glowRef = useAudioGlow(controller, isPlaying);
	const [layers, setLayers] = useState<CoverLayer[]>([]);
	const nextId = useRef(0);

	const fadingOut = coverUrl === undefined;
	const top = topLayer(layers);
	const topId = top?.id;
	const topLoaded = top?.loaded ?? false;

	// A cached cover fires load in the same frame it mounts, and a style change
	// that was never painted starts no transition. Two frames, because one rAF
	// callback can still run before that frame's paint.
	const settle = useCallback((id: number) => {
		requestAnimationFrame(() =>
			requestAnimationFrame(() =>
				setLayers((prev) =>
					prev.some((layer) => layer.id === id && !layer.loaded)
						? prev.map((l) => (l.id === id ? { ...l, loaded: true } : l))
						: prev,
				),
			),
		);
	}, []);

	useEffect(() => {
		if (coverUrl === undefined) return;
		const id = nextId.current++;
		setLayers((prev) => {
			const current = topLayer(prev);
			if (current?.url === coverUrl) return prev;
			const incoming = { id, url: coverUrl, loaded: false };
			return current && !current.loaded
				? [...prev.slice(0, -1), incoming]
				: [...prev, incoming];
		});
	}, [coverUrl]);

	useEffect(() => {
		const staleCount = layers.length - (fadingOut ? 0 : 1);
		const faded = fadingOut || topLoaded;
		if (staleCount < 1 || !faded) return;
		const timer = setTimeout(
			() => setLayers((prev) => (fadingOut ? [] : prev.slice(-1))),
			FADE_MS,
		);
		return () => clearTimeout(timer);
	}, [layers.length, fadingOut, topId, topLoaded]);

	if (layers.length === 0) return null;

	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
		>
			<div ref={glowRef} className="absolute inset-0 opacity-70">
				{layers.map((layer) => (
					<div
						key={layer.id}
						style={{ transitionDuration: `${FADE_MS}ms` }}
						className={cn(
							"absolute -inset-40 bg-card transition-opacity",
							layer.loaded && !fadingOut ? "opacity-100" : "opacity-0",
						)}
					>
						<img
							src={layer.url}
							alt=""
							ref={(el) => {
								// An already-decoded image may never fire load where React can hear it.
								if (!el?.complete || layer.loaded) return;
								settle(layer.id);
							}}
							onLoad={() => settle(layer.id)}
							onError={() => settle(layer.id)}
							className="h-full w-full object-cover blur-2xl"
						/>
					</div>
				))}
			</div>
			<div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/70 to-background/75" />
		</div>
	);
});
