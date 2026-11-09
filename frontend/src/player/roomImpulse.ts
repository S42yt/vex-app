export interface Room {
	preDelaySec: number;
	rt60Sec: number;
	earlySec: number;
	earlyCount: number;
	earlyLevel: number;
	seed: number;
}

export const SMALL: Room = {
	preDelaySec: 0.014,
	rt60Sec: 0.8,
	earlySec: 0.05,
	earlyCount: 16,
	earlyLevel: 2.5,
	seed: 0x5eed1e55,
};
export const LARGE: Room = {
	preDelaySec: 0.032,
	rt60Sec: 2.6,
	earlySec: 0.11,
	earlyCount: 26,
	earlyLevel: 1.6,
	seed: 0x9e3779b9,
};

// Halls measure 1.4x RT60 at 125 Hz and 0.45x at 8 kHz, the low end kept under.
const BASS_RT = 1.15;
const AIR_RT = 0.45;
const BASS_HZ = 400;
const BODY_HZ = 2600;
// Steep or the body tail outlives the air one at 8 kHz; gentle on the low layer
// or the body layer owns the low end instead.
const TOP_POLES = 4;
const BOTTOM_POLES = 2;
const BASS_POLES = 2;
// Own noise per layer: filtered copies of one stream cancel where they overlap.
const OVERLAP = 0.75;
const BASS_LEVEL = 0.43;
const BODY_LEVEL = 1;
const AIR_LEVEL = 1.2;
const AIR_TONE_HZ = 6000;

const EARLY_TONE_HZ = 5200;
const EAR_SEC = 0.0006;
// Convolution multiplies spectra, and music is already bass-heavy.
const LOW_CUT_HZ = 210;
const LOW_CUT_POLES = 2;
const FADE_SEC = 0.25;

function roomNoise(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function lowpassCoefficient(hz: number, rate: number): number {
	return 1 - Math.exp((-2 * Math.PI * hz) / rate);
}

function decayStep(rt60Sec: number, rate: number): number {
	return Math.exp(Math.log(0.001) / (rt60Sec * rate));
}

function lowpass(state: Float32Array, coefficient: number, x: number): number {
	let carry = x;
	for (let i = 0; i < state.length; i++) {
		state[i] += coefficient * (carry - state[i]);
		carry = state[i];
	}
	return carry;
}

function highpass(state: Float32Array, coefficient: number, x: number): number {
	let carry = x;
	for (let i = 0; i < state.length; i++) {
		state[i] += coefficient * (carry - state[i]);
		carry -= state[i];
	}
	return carry;
}

function layerNoise(
	rate: number,
	seed: number,
	bassSeed: number,
): () => Float32Array {
	const bassCoefficient = lowpassCoefficient(BASS_HZ, rate);
	const bodyCoefficient = lowpassCoefficient(BODY_HZ, rate);
	const bodyFloor = lowpassCoefficient(BASS_HZ * OVERLAP, rate);
	const airFloor = lowpassCoefficient(BODY_HZ * OVERLAP, rate);
	const airTone = lowpassCoefficient(AIR_TONE_HZ, rate);
	const bassNoise = roomNoise(bassSeed);
	const bodyNoise = roomNoise(seed ^ 0x85ebca6b);
	const airNoise = roomNoise(seed ^ 0xc2b2ae35);
	const bassTop = new Float32Array(BASS_POLES);
	const bodyBottom = new Float32Array(BOTTOM_POLES);
	const bodyTop = new Float32Array(TOP_POLES);
	const airBottom = new Float32Array(BOTTOM_POLES);
	const airTop = new Float32Array(1);
	const out = new Float32Array(3);
	return () => {
		out[0] = lowpass(bassTop, bassCoefficient, bassNoise() * 2 - 1);
		out[1] = lowpass(
			bodyTop,
			bodyCoefficient,
			highpass(bodyBottom, bodyFloor, bodyNoise() * 2 - 1),
		);
		out[2] = lowpass(
			airTop,
			airTone,
			highpass(airBottom, airFloor, airNoise() * 2 - 1),
		);
		return out;
	};
}

// Level constants hold only once each layer is measured back to unit variance.
function layerGains(rate: number): [number, number, number] {
	const layers = layerNoise(rate, 0x2545f491, 0x2545f491);
	const count = 1 << 16;
	let bass = 0;
	let body = 0;
	let air = 0;
	for (let i = 0; i < count; i++) {
		const layer = layers();
		bass += layer[0] * layer[0];
		body += layer[1] * layer[1];
		air += layer[2] * layer[2];
	}
	return [
		BASS_LEVEL / Math.sqrt(bass / count),
		BODY_LEVEL / Math.sqrt(body / count),
		AIR_LEVEL / Math.sqrt(air / count),
	];
}

export function buildImpulse(
	context: BaseAudioContext,
	room: Room,
): AudioBuffer {
	const rate = context.sampleRate;
	const head = Math.round(room.preDelaySec * rate);
	const tailSec = room.rt60Sec * BASS_RT + FADE_SEC;
	const buffer = context.createBuffer(
		2,
		head + Math.round(tailSec * rate),
		rate,
	);
	const gains = layerGains(rate);

	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		const samples = buffer.getChannelData(channel);
		addEarlyReflections(samples, head, rate, room, channel);
		addTail(samples, head, rate, room, gains, channel);
		cutLowEnd(samples, rate);
		normalise(samples);
	}
	return buffer;
}

function addEarlyReflections(
	samples: Float32Array,
	head: number,
	rate: number,
	room: Room,
	channel: number,
): void {
	const span = Math.round(room.earlySec * rate);
	const cluster = new Float32Array(span);
	// One set at ear spacing: a set per channel puts a room in each ear.
	const random = roomNoise(room.seed);
	const ear = roomNoise(room.seed ^ (0x632be59b * (channel + 1)));
	const spread = EAR_SEC * rate;
	for (let i = 0; i < room.earlyCount; i++) {
		const when = ((i + random()) / room.earlyCount) ** 0.7;
		const at = Math.min(
			span - 1,
			Math.max(0, Math.round(when * span + (ear() * 2 - 1) * spread)),
		);
		const level =
			room.earlyLevel * Math.exp(-2.2 * when) * (0.7 + random() * 0.6);
		cluster[at] += random() < 0.5 ? -level : level;
	}

	const coefficient = lowpassCoefficient(EARLY_TONE_HZ, rate);
	const makeup = Math.sqrt((2 - coefficient) / coefficient);
	let filtered = 0;
	for (let i = 0; i < span; i++) {
		filtered += coefficient * (cluster[i] - filtered);
		samples[head + i] += filtered * makeup;
	}
}

function addTail(
	samples: Float32Array,
	head: number,
	rate: number,
	room: Room,
	[gainBass, gainBody, gainAir]: [number, number, number],
	channel: number,
): void {
	const length = samples.length - head;
	const fadeFrom = length - Math.round(FADE_SEC * rate);
	// Shared low layer: a real field is coherent where wavelength outruns the ears.
	const layers = layerNoise(rate, room.seed + channel * 0x9e3779b9, room.seed);
	const stepBass = decayStep(room.rt60Sec * BASS_RT, rate);
	const stepBody = decayStep(room.rt60Sec, rate);
	const stepAir = decayStep(room.rt60Sec * AIR_RT, rate);
	const buildStep = Math.exp(-1 / (room.earlySec * 0.6 * rate));

	let decayBass = 1;
	let decayBody = 1;
	let decayAir = 1;
	let undiffused = 1;
	for (let i = 0; i < length; i++) {
		const layer = layers();

		let envelope = 1 - undiffused;
		if (i >= fadeFrom) {
			const t = (i - fadeFrom + 1) / (length - fadeFrom);
			envelope *= (1 + Math.cos(Math.PI * t)) / 2;
		}
		samples[head + i] +=
			envelope *
			(gainBass * layer[0] * decayBass +
				gainBody * layer[1] * decayBody +
				gainAir * layer[2] * decayAir);

		decayBass *= stepBass;
		decayBody *= stepBody;
		decayAir *= stepAir;
		undiffused *= buildStep;
	}
}

function cutLowEnd(samples: Float32Array, rate: number): void {
	const coefficient = lowpassCoefficient(LOW_CUT_HZ, rate);
	const state = new Float32Array(LOW_CUT_POLES);
	for (let i = 0; i < samples.length; i++) {
		samples[i] = highpass(state, coefficient, samples[i]);
	}
}

function normalise(samples: Float32Array): void {
	let energy = 0;
	for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
	if (energy <= 0) return;
	const scale = 1 / Math.sqrt(energy);
	for (let i = 0; i < samples.length; i++) samples[i] *= scale;
}
