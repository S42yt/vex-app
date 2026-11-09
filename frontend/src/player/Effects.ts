import { clamp } from "@/lib/utils";
import type { GraphStage } from "./audioGraph";
import { Drive } from "./Drive";
import { Reverb } from "./Reverb";

export const RATE_MIN = 0.5;
export const RATE_MAX = 1.5;
// Radix rounds every value it produces to the step decimal count, so 1 arrives
// as exactly 1, which is what reset and the panel compare against.
export const RATE_STEP = 0.05;

export interface EffectsState {
	rate: number;
	preservePitch: boolean;
	drive: number;
	reverbMix: number;
}

export class Effects implements GraphStage {
	private subscribers = new Set<() => void>();
	private rate = 1;
	private preservePitch = false;
	private readonly drive: Drive;
	private readonly reverb = new Reverb();
	private snapshot: EffectsState;

	constructor(private readonly audio: HTMLAudioElement) {
		this.drive = new Drive(audio);
		this.snapshot = this.buildSnapshot();
		this.applyRate();
	}

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): EffectsState => this.snapshot;

	setRate(rate: number): void {
		const next = clamp(rate, RATE_MIN, RATE_MAX, 1);
		if (next === this.rate) return;
		this.rate = next;
		this.applyRate();
		this.commit();
	}

	setPreservePitch(preservePitch: boolean): void {
		if (preservePitch === this.preservePitch) return;
		this.preservePitch = preservePitch;
		this.applyRate();
		this.commit();
	}

	setDrive(drive: number): void {
		if (this.drive.set(drive)) this.commit();
	}

	setReverbMix(mix: number): void {
		if (this.reverb.set(mix)) this.commit();
	}

	reset(): void {
		const speed = this.rate !== 1;
		if (speed) {
			this.rate = 1;
			this.applyRate();
		}
		const drive = this.drive.set(0);
		const reverb = this.reverb.set(0);
		if (speed || drive || reverb) this.commit();
	}

	attach(context: AudioContext, input: AudioNode): AudioNode {
		return this.reverb.attach(context, this.drive.attach(context, input));
	}

	release(): void {
		this.drive.release();
		this.reverb.release();
	}

	private applyRate(): void {
		this.audio.defaultPlaybackRate = this.rate;
		this.audio.playbackRate = this.rate;
		this.audio.preservesPitch = this.preservePitch;
	}

	private commit(): void {
		this.snapshot = this.buildSnapshot();
		this.subscribers.forEach((notify) => notify());
	}

	private buildSnapshot(): EffectsState {
		return {
			rate: this.rate,
			preservePitch: this.preservePitch,
			drive: this.drive.value,
			reverbMix: this.reverb.value,
		};
	}
}
