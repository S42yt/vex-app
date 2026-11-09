export type CoverFit = "contain" | "cover";

const SAMPLE_WIDTH = 64;
const INSET = 1;
const FLAT_TOLERANCE = 12;
const OUTLIER_SHARE = 0.02;

const measured = new Map<string, CoverFit>();
const CACHE_LIMIT = 600;

let scratch: CanvasRenderingContext2D | null = null;

export function knownCoverFit(url: string): CoverFit | undefined {
	return measured.get(url);
}

export function measureCoverFit(url: string, img: HTMLImageElement): CoverFit {
	const cached = measured.get(url);
	if (cached !== undefined) return cached;

	const fit = measure(img);
	if (measured.size >= CACHE_LIMIT) {
		const oldest = measured.keys().next().value;
		if (oldest !== undefined) measured.delete(oldest);
	}
	measured.set(url, fit);
	return fit;
}

function measure(img: HTMLImageElement): CoverFit {
	const width = img.naturalWidth;
	const height = img.naturalHeight;
	if (width === 0 || height === 0) return "contain";
	if (Math.abs(width - height) <= width * 0.02) return "cover";

	const sampleHeight = Math.max(1, Math.round((SAMPLE_WIDTH * height) / width));
	const band = Math.round((SAMPLE_WIDTH - sampleHeight) / 2);
	if (band <= 2 * INSET) return "contain";

	const ctx = context(sampleHeight);
	ctx.drawImage(img, 0, 0, SAMPLE_WIDTH, sampleHeight);

	let pixels: Uint8ClampedArray;
	try {
		pixels = ctx.getImageData(0, 0, SAMPLE_WIDTH, sampleHeight).data;
	} catch {
		return "contain";
	}

	const flat =
		isFlat(pixels, sampleHeight, INSET, band - INSET) &&
		isFlat(pixels, sampleHeight, SAMPLE_WIDTH - band + INSET, SAMPLE_WIDTH - INSET);
	return flat ? "cover" : "contain";
}

function isFlat(
	pixels: Uint8ClampedArray,
	sampleHeight: number,
	fromX: number,
	toX: number,
): boolean {
	const fromY = INSET;
	const toY = sampleHeight - INSET;
	let sumR = 0;
	let sumG = 0;
	let sumB = 0;
	let count = 0;
	for (let y = fromY; y < toY; y++) {
		for (let x = fromX; x < toX; x++) {
			const i = (y * SAMPLE_WIDTH + x) * 4;
			sumR += pixels[i]!;
			sumG += pixels[i + 1]!;
			sumB += pixels[i + 2]!;
			count++;
		}
	}
	if (count === 0) return false;

	const meanR = sumR / count;
	const meanG = sumG / count;
	const meanB = sumB / count;
	let outliers = 0;
	for (let y = fromY; y < toY; y++) {
		for (let x = fromX; x < toX; x++) {
			const i = (y * SAMPLE_WIDTH + x) * 4;
			if (
				Math.abs(pixels[i]! - meanR) > FLAT_TOLERANCE ||
				Math.abs(pixels[i + 1]! - meanG) > FLAT_TOLERANCE ||
				Math.abs(pixels[i + 2]! - meanB) > FLAT_TOLERANCE
			) {
				outliers++;
			}
		}
	}
	return outliers <= count * OUTLIER_SHARE;
}

function context(height: number): CanvasRenderingContext2D {
	scratch ??= document
		.createElement("canvas")
		.getContext("2d", { willReadFrequently: true })!;
	scratch.canvas.width = SAMPLE_WIDTH;
	scratch.canvas.height = height;
	return scratch;
}
