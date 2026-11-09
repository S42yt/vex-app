import { MAX_IMAGE_BASE64 } from "./limits.gen";

export * from "./limits.gen";

export const MAX_IMAGE_BYTES = Math.floor(MAX_IMAGE_BASE64 / 4) * 3;
