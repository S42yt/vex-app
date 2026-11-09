import { clamp } from "@/lib/utils";
import { easeParam, type GraphStage } from "./audioGraph";

export const EQ_BANDS = [
	31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

export const EQ_GAIN_LIMIT_DB = 12;
export const EQ_GAIN_STEP_DB = 0.5;

const BAND_Q = Math.SQRT2;

export interface EqualizerState {
	enabled: boolean;
	gains: readonly number[];
}

const clampDb = (db: number): number =>
	clamp(db, -EQ_GAIN_LIMIT_DB, EQ_GAIN_LIMIT_DB, 0);

export class Equalizer implements GraphStage {
	private subscribers = new Set<() => void>();
	private enabled = true;
	private gains: number[] = EQ_BANDS.map(() => 0);
	private snapshot: EqualizerState;

	private context: AudioContext | null = null;
	private filters: BiquadFilterNode[] = [];

	constructor() {
		this.snapshot = this.buildSnapshot();
	}

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): EqualizerState => this.snapshot;

	setEnabled(enabled: boolean): void {
		if (enabled === this.enabled) return;
		this.enabled = enabled;
		this.commit();
	}

	setBandGain(index: number, db: number): void {
		if (index < 0 || index >= this.gains.length) return;
		const gain = clampDb(db);
		if (this.gains[index] === gain) return;
		this.gains = this.gains.map((current, i) => (i === index ? gain : current));
		this.commit();
	}

	restore(stored: {
		enabled: boolean | null;
		gains: readonly number[] | null;
	}): void {
		if (stored.enabled !== null) this.enabled = stored.enabled;
		if (stored.gains !== null) {
			const gains = stored.gains;
			this.gains = this.gains.map((current, index) =>
				clampDb(gains[index] ?? current),
			);
		}
		this.commit();
	}

	reset(): void {
		if (this.gains.every((gain) => gain === 0)) return;
		this.gains = this.gains.map(() => 0);
		this.commit();
	}

	attach(context: AudioContext, input: AudioNode): AudioNode {
		this.context = context;
		this.filters = EQ_BANDS.map((hz, index) => {
			const filter = context.createBiquadFilter();
			if (index === 0) {
				filter.type = "lowshelf";
			} else if (index === EQ_BANDS.length - 1) {
				filter.type = "highshelf";
			} else {
				filter.type = "peaking";
				filter.Q.value = BAND_Q;
			}
			filter.frequency.value = hz;
			return filter;
		});

		const output = this.filters.reduce<AudioNode>((previous, filter) => {
			previous.connect(filter);
			return filter;
		}, input);
		this.apply();
		return output;
	}

	release(): void {
		this.context = null;
		this.filters = [];
	}

	private commit(): void {
		this.apply();
		this.snapshot = this.buildSnapshot();
		this.subscribers.forEach((notify) => notify());
	}

	private apply(): void {
		const context = this.context;
		if (!context) return;
		const at = context.currentTime;
		this.filters.forEach((filter, index) => {
			easeParam(filter.gain, this.enabled ? this.gains[index] : 0, at);
		});
	}

	private buildSnapshot(): EqualizerState {
		return {
			enabled: this.enabled,
			gains: this.gains,
		};
	}
}
