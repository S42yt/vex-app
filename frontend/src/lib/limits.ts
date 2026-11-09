import { MAX_AUDIO_BASE64, MAX_IMAGE_BASE64 } from "./limits.gen";

export * from "./limits.gen";

// Decoded size of a base64 cap: 4 characters carry 3 bytes.
export const MAX_IMAGE_BYTES = Math.floor(MAX_IMAGE_BASE64 / 4) * 3;
export const MAX_AUDIO_BYTES = Math.floor(MAX_AUDIO_BASE64 / 4) * 3;

export function base64Length(bytes: number): number {
	return Math.ceil(bytes / 3) * 4;
}
