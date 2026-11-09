import { clamp } from "@/lib/utils";
import {
	easeParam,
	writeRamp,
	writeValue,
	type GraphStage,
	type ParamWriter,
} from "./audioGraph";
import { measureProgramLevel } from "./programLevel";

const PROGRAM_DBFS = -16;
const PROGRAM_RMS = 10 ** (PROGRAM_DBFS / 20);

const OVERDRIVE_DB = 8;
const MIN_DB = -12;

const MAX_DB = OVERDRIVE_DB - PROGRAM_DBFS;

const gainFor = (amount: number): number =>
	10 ** ((MIN_DB + (MAX_DB - MIN_DB) * amount) / 20);

const MAKEUP_TAU = 0.25;

const MAX_SHELF_DB = 6;
const SHELF_HZ = 100;

const BASS_ENERGY_SHARE = 0.5;
const BASS_LOUDNESS_SHARE = 0.15;

const shelfFactor = (db: number, share: number): number =>
	Math.sqrt(1 + share * (10 ** (db / 10) - 1));

const CURVE_POINTS = 2048;

function curveFor(gain: number): Float32Array<ArrayBuffer> {
	const curve = new Float32Array(CURVE_POINTS);
	for (let i = 0; i < CURVE_POINTS; i++) {
		curve[i] = Math.tanh(gain * ((i / (CURVE_POINTS - 1)) * 2 - 1));
	}
	return curve;
}

const MODEL_POINTS = 256;
const MODEL_SPAN = 4;

function drivenRms(gain: number, sigma: number): number {
	const span = MODEL_SPAN * sigma;
	const step = (2 * span) / (MODEL_POINTS - 1);
	let weight = 0;
	let square = 0;
	for (let i = 0; i < MODEL_POINTS; i++) {
		const x = -span + i * step;
		const w = Math.exp(-(x * x) / (2 * sigma * sigma));
		const y = Math.tanh(gain * Math.min(Math.max(x, -1), 1));
		weight += w;
		square += w * y * y;
	}
	return Math.sqrt(square / weight);
}

interface DriveGraph {
	context: AudioContext;
	shelf: BiquadFilterNode;
	shaper: WaveShaperNode;
	post: GainNode;
}

function buildDrive(context: AudioContext, input: AudioNode): DriveGraph {
	const shelf = context.createBiquadFilter();
	shelf.type = "lowshelf";
	shelf.frequency.value = SHELF_HZ;
	const shaper = context.createWaveShaper();
	// Harmonics thrown past half the sample rate fold back down as tones belonging
	// to no note in the track.
	shaper.oversample = "4x";
	const post = context.createGain();
	input.connect(shelf).connect(shaper).connect(post);
	return { context, shelf, shaper, post };
}

export class Drive implements GraphStage {
	private amount = 0;
	private graph: DriveGraph | null = null;
	private program = PROGRAM_RMS;
	private scan: AbortController | null = null;

	constructor(private readonly audio: HTMLAudioElement) {
		audio.addEventListener("volumechange", this.followVolume);
		audio.addEventListener("loadstart", this.followTrack);
	}

	get value(): number {
		return this.amount;
	}

	set(amount: number): boolean {
		const next = clamp(amount, 0, 1, 0);
		if (next === this.amount) return false;
		const bypassed = this.amount === 0;
		this.amount = next;
		if (bypassed) this.measure();
		const graph = this.graph;
		if (graph) this.writeLevels(graph, writeRamp(graph.context.currentTime));
		return true;
	}

	attach(context: AudioContext, input: AudioNode): AudioNode {
		const graph = buildDrive(context, input);
		this.graph = graph;
		this.writeLevels(graph, writeValue);
		return graph.post;
	}

	release(): void {
		this.graph = null;
	}

	private writeLevels(graph: DriveGraph, write: ParamWriter): void {
		write(graph.shelf.gain, MAX_SHELF_DB * this.amount);
		if (this.amount === 0) {
			// No curve is the pass-through the spec gives a WaveShaper.
			graph.shaper.curve = null;
			graph.post.gain.value = 1;
			return;
		}
		const volume = this.audio.volume;
		const gain = gainFor(this.amount);
		graph.shaper.curve = curveFor(volume > 0 ? gain / volume : gain);
		graph.post.gain.value = this.postGain();
	}

	private writeMakeup(): void {
		const graph = this.graph;
		if (!graph || this.amount === 0) return;
		easeParam(
			graph.post.gain,
			this.postGain(),
			graph.context.currentTime,
			MAKEUP_TAU,
		);
	}

	private postGain(): number {
		const shelfDb = MAX_SHELF_DB * this.amount;
		const driven = this.program * shelfFactor(shelfDb, BASS_ENERGY_SHARE);
		const target = this.program * shelfFactor(shelfDb, BASS_LOUDNESS_SHARE);
		return (
			(this.audio.volume * target) / drivenRms(gainFor(this.amount), driven)
		);
	}

	private followVolume = (): void => {
		const graph = this.graph;
		if (!graph || this.amount === 0) return;
		this.writeLevels(graph, writeValue);
	};

	private followTrack = (): void => {
		this.scan?.abort();
		this.scan = null;
		this.program = PROGRAM_RMS;
		this.writeMakeup();
		this.measure();
	};

	private measure(): void {
		const url = this.audio.currentSrc;
		if (!url || this.amount === 0 || this.scan) return;
		const scan = new AbortController();
		this.scan = scan;
		void measureProgramLevel(url, scan.signal).then((rms) => {
			if (this.scan === scan) this.scan = null;
			if (rms === null || this.audio.currentSrc !== url) return;
			this.program = rms;
			this.writeMakeup();
		});
	}
}
