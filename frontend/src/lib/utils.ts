import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function clamp(
	value: number,
	min: number,
	max: number,
	fallback: number,
): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(Math.max(value, min), max);
}

export function formatTime(totalSeconds: number): string {
	if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "–:––";
	const seconds = Math.floor(totalSeconds % 60);
	const minutes = Math.floor((totalSeconds / 60) % 60);
	const hours = Math.floor(totalSeconds / 3600);
	const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
	const ss = String(seconds).padStart(2, "0");
	return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function countLabel(count: number, noun: string): string {
	return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function trackCountLabel(count: number): string {
	return count === 0 ? "No tracks" : countLabel(count, "track");
}

export function formatMb(bytes: number): string {
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function tooLargeMessage(
	bytes: number,
	limit: number,
	what: string,
): string | null {
	if (bytes <= limit) return null;
	return `That ${what} is ${formatMb(bytes)} — the server accepts up to ${formatMb(limit)}.`;
}

export function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () =>
			reject(reader.error ?? new Error("Failed to read file data"));
		reader.onload = () => {
			const dataUrl = reader.result as string;
			resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
		};
		reader.readAsDataURL(blob);
	});
}
