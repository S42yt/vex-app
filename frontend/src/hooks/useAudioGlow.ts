import { useEffect, useRef } from "react";
import type { PlayerController } from "@/player/PlayerController";

const BASS_HZ = 160;
const PUNCH_LOW_HZ = 1500;
const PUNCH_HIGH_HZ = 8000;
const BASS_WEIGHT = 0.7;

const RANGE_DB = 14;
const PEAK_FALL_DB_PER_SEC = 3;
const MIN_PEAK_DB = -60;
const ATTACK_TAU = 0.05;
const RELEASE_TAU = 0.22;
const CURVE = 1.6;
const BRIGHTNESS_GAIN = 0.6;
const SATURATION_GAIN = 0.4;
const SETTLED = 0.004;

function bandLevel(data: Float32Array, start: number, end: number): number {
	let sum = 0;
	for (let bin = start; bin < end; bin++) sum += 10 ** (data[bin] / 20);
	return sum / Math.max(1, end - start);
}

export function useAudioGlow(controller: PlayerController, isPlaying: boolean) {
	const nodeRef = useRef<HTMLDivElement | null>(null);
	const frameRef = useRef<number | null>(null);
	const playingRef = useRef(isPlaying);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const dataRef = useRef(new Float32Array(0));
	const bandsRef = useRef({ bass: 1, punchStart: 1, punchEnd: 1 });
	const peakDbRef = useRef(MIN_PEAK_DB);
	const primedRef = useRef(false);
	const levelRef = useRef(0);
	const lastFrameRef = useRef(0);

	useEffect(() => {
		playingRef.current = isPlaying;
		if (!isPlaying || frameRef.current !== null) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		lastFrameRef.current = performance.now();
		primedRef.current = false;

		const tick = () => {
			const node = nodeRef.current;
			const analyser = controller.analyser;
			if (analyser !== analyserRef.current) {
				analyserRef.current = analyser;
				dataRef.current = new Float32Array(analyser?.frequencyBinCount ?? 0);
				if (analyser) {
					const bins = analyser.frequencyBinCount;
					const nyquist = analyser.context.sampleRate / 2;
					const binFor = (hz: number) =>
						Math.min(bins, Math.max(1, Math.round((hz / nyquist) * bins)));
					bandsRef.current = {
						bass: binFor(BASS_HZ),
						punchStart: binFor(PUNCH_LOW_HZ),
						punchEnd: binFor(PUNCH_HIGH_HZ),
					};
				}
			}

			const now = performance.now();
			const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000);
			lastFrameRef.current = now;

			let target = 0;
			if (analyser && playingRef.current) {
				analyser.getFloatFrequencyData(dataRef.current);
				const { bass, punchStart, punchEnd } = bandsRef.current;
				const energy =
					BASS_WEIGHT * bandLevel(dataRef.current, 1, bass) +
					(1 - BASS_WEIGHT) *
						bandLevel(dataRef.current, punchStart, punchEnd);
				const db = 20 * Math.log10(energy + 1e-12);

				if (!primedRef.current) {
					peakDbRef.current = Math.max(db, MIN_PEAK_DB);
					primedRef.current = true;
				}
				peakDbRef.current = Math.max(
					db,
					MIN_PEAK_DB,
					peakDbRef.current - PEAK_FALL_DB_PER_SEC * dt,
				);

				const floor = peakDbRef.current - RANGE_DB;
				const scaled = (db - floor) / RANGE_DB;
				target = Math.min(1, Math.max(0, scaled)) ** CURVE;
			}

			const previous = levelRef.current;
			const tau = target > previous ? ATTACK_TAU : RELEASE_TAU;
			const level =
				previous + (target - previous) * (1 - Math.exp(-dt / tau));
			levelRef.current = level;

			const done = level < SETTLED;
			const filter = done
				? ""
				: `brightness(${1 + level * BRIGHTNESS_GAIN}) saturate(${
						1 + level * SATURATION_GAIN
					})`;
			if (node && node.style.filter !== filter) node.style.filter = filter;

			if (!playingRef.current && done) {
				frameRef.current = null;
				return;
			}
			frameRef.current = requestAnimationFrame(tick);
		};

		frameRef.current = requestAnimationFrame(tick);
	}, [isPlaying, controller]);

	useEffect(
		() => () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		},
		[],
	);

	return nodeRef;
}
