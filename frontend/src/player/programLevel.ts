const HEAD_PATH = "/head";

const BLOCK_SECONDS = 3;

// Under this a head is silence, not a quiet track. Answering null keeps a zero
// out of Drive's model, whose integral is undefined there, and an AudioParam
// refuses the NaN.
const FLOOR_RMS = 10 ** (-40 / 20);

const DECODE_RATE = 44100;

let decoder: OfflineAudioContext | null = null;

const measured = new Map<string, number | null>();

function loudestBlock(buffer: AudioBuffer): number | null {
	const channels: Float32Array[] = [];
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		channels.push(buffer.getChannelData(c));
	}
	const block = Math.min(
		Math.floor(BLOCK_SECONDS * buffer.sampleRate),
		buffer.length,
	);
	if (block === 0) return null;

	let loudest = 0;
	for (let start = 0; start + block <= buffer.length; start += block) {
		let square = 0;
		for (const data of channels) {
			for (let i = start; i < start + block; i++) square += data[i] * data[i];
		}
		const rms = Math.sqrt(square / (block * channels.length));
		if (rms > loudest) loudest = rms;
	}
	return loudest >= FLOOR_RMS ? loudest : null;
}

export async function measureProgramLevel(
	url: string,
	signal: AbortSignal,
): Promise<number | null> {
	const settled = measured.get(url);
	if (settled !== undefined) return settled;

	try {
		const response = await fetch(url + HEAD_PATH, { signal });
		if (!response.ok) {
			void response.body?.cancel();
			measured.set(url, null);
			return null;
		}
		const bytes = await response.arrayBuffer();
		if (signal.aborted) return null;
		// An OfflineAudioContext decodes without a user gesture and without touching
		// the context the track plays through, which may not exist yet.
		decoder ??= new OfflineAudioContext(1, 1, DECODE_RATE);
		const buffer = await decoder.decodeAudioData(bytes);
		const level = loudestBlock(buffer);
		measured.set(url, level);
		return level;
	} catch {
		if (!signal.aborted) measured.set(url, null);
		return null;
	}
}
