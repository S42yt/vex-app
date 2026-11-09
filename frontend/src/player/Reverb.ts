import { clamp } from "@/lib/utils";
import {
	writeRamp,
	writeValue,
	type GraphStage,
	type ParamWriter,
} from "./audioGraph";
import { buildImpulse, LARGE, SMALL, type Room } from "./roomImpulse";

const WET_MAX = 0.5;
// Where wet energy peaks and a lead vocal sits.
const POCKET_HZ = 1400;
const POCKET_Q = 0.7;
const POCKET_DB = 8;

class RoomBranch {
	readonly gain: GainNode;
	private readonly convolver: ConvolverNode;
	private impulse: AudioBuffer | null = null;

	constructor(
		private readonly context: AudioContext,
		private readonly room: Room,
		input: AudioNode,
		into: AudioNode,
	) {
		this.convolver = context.createConvolver();
		this.convolver.normalize = false;
		this.gain = context.createGain();
		input.connect(this.convolver).connect(this.gain).connect(into);
	}

	load(): void {
		this.impulse ??= buildImpulse(this.context, this.room);
		if (this.convolver.buffer !== this.impulse) {
			this.convolver.buffer = this.impulse;
		}
	}
}

interface ReverbGraph {
	context: AudioContext;
	mix: GainNode;
	wet: GainNode;
	pocket: BiquadFilterNode;
	small: RoomBranch;
	large: RoomBranch;
}

function buildReverb(context: AudioContext, input: AudioNode): ReverbGraph {
	const mix = context.createGain();
	const wet = context.createGain();
	const pocket = context.createBiquadFilter();
	pocket.type = "peaking";
	pocket.frequency.value = POCKET_HZ;
	pocket.Q.value = POCKET_Q;
	wet.connect(pocket).connect(mix);
	input.connect(mix);
	return {
		context,
		mix,
		wet,
		pocket,
		small: new RoomBranch(context, SMALL, input, wet),
		large: new RoomBranch(context, LARGE, input, wet),
	};
}

export class Reverb implements GraphStage {
	private amount = 0;
	private graph: ReverbGraph | null = null;

	get value(): number {
		return this.amount;
	}

	set(amount: number): boolean {
		const next = clamp(amount, 0, 1, 0);
		if (next === this.amount) return false;
		this.amount = next;
		const graph = this.graph;
		if (graph) {
			this.loadImpulses();
			this.writeLevels(graph, writeRamp(graph.context.currentTime));
		}
		return true;
	}

	attach(context: AudioContext, input: AudioNode): AudioNode {
		const graph = buildReverb(context, input);
		this.graph = graph;
		this.loadImpulses();
		this.writeLevels(graph, writeValue);
		return graph.mix;
	}

	release(): void {
		this.graph = null;
	}

	private loadImpulses(): void {
		const graph = this.graph;
		if (this.amount <= 0 || !graph) return;
		graph.small.load();
		graph.large.load();
	}

	private writeLevels(graph: ReverbGraph, write: ParamWriter): void {
		const turn = (this.amount * Math.PI) / 2;
		const wet = WET_MAX * Math.sin(turn);
		write(graph.mix.gain, 1 / Math.hypot(1, wet));
		write(graph.wet.gain, wet);
		write(graph.pocket.gain, -POCKET_DB * Math.sin(turn));
		write(graph.small.gain.gain, Math.cos(turn));
		write(graph.large.gain.gain, Math.sin(turn));
	}
}
