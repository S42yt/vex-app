import { MAX_IMAGE_BASE64 } from "./limits.gen";

export * from "./limits.gen";

// Decoded size of a base64 cap: 4 characters carry 3 bytes.
export const MAX_IMAGE_BYTES = Math.floor(MAX_IMAGE_BASE64 / 4) * 3;
