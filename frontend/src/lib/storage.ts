import { EQ_BANDS, EQ_GAIN_LIMIT_DB } from "@/player/Equalizer";
import type { SearchSource } from "@/api/types";
import type { RepeatMode } from "@/player/types";

class StoredValue<T> {
	constructor(
		private readonly key: string,
		private readonly encode: (value: T) => string,
		private readonly decode: (raw: string) => T | null,
	) {}

	get(): T | null {
		const raw = localStorage.getItem(this.key);
		return raw === null ? null : this.decode(raw);
	}

	set(value: T): void {
		localStorage.setItem(this.key, this.encode(value));
	}

	remove(): void {
		localStorage.removeItem(this.key);
	}
}

const stringValue = (key: string): StoredValue<string> =>
	new StoredValue(
		key,
		(value) => value,
		(raw) => raw,
	);

const booleanValue = (key: string): StoredValue<boolean> =>
	new StoredValue(key, String, (raw) =>
		raw === "true" || raw === "false" ? raw === "true" : null,
	);

const numberValue = (
	key: string,
	isValid: (value: number) => boolean = () => true,
): StoredValue<number> =>
	new StoredValue(key, String, (raw) => {
		const value = Number(raw);
		return Number.isFinite(value) && isValid(value) ? value : null;
	});

const numberListValue = (
	key: string,
	length: number,
	isValid: (value: number) => boolean = () => true,
): StoredValue<readonly number[]> =>
	new StoredValue(
		key,
		(value) => value.join(","),
		(raw) => {
			const values = raw.split(",").map(Number);
			return values.length === length &&
				values.every((value) => Number.isFinite(value) && isValid(value))
				? values
				: null;
		},
	);

const enumValue = <T extends string>(
	key: string,
	allowed: readonly T[],
): StoredValue<T> =>
	new StoredValue(
		key,
		(value) => value,
		(raw) => (allowed.includes(raw as T) ? (raw as T) : null),
	);

export const storage = {
	session: {
		url: stringValue("player.server.url"),
		token: stringValue("player.server.token"),
		proxy: stringValue("player.server.proxy"),
	},
	player: {
		volume: numberValue("player.volume", (v) => v >= 0 && v <= 1),
		muted: booleanValue("player.muted"),
		repeat: enumValue<RepeatMode>("player.repeat", ["off", "all", "one"]),
		shuffle: booleanValue("player.shuffle"),
	},
	equalizer: {
		enabled: booleanValue("equalizer.enabled"),
		gains: numberListValue(
			"equalizer.gains",
			EQ_BANDS.length,
			(value) => Math.abs(value) <= EQ_GAIN_LIMIT_DB,
		),
	},
	discord: {
		presenceEnabled: booleanValue("discord.presenceEnabled"),
	},
	downloads: {
		folder: stringValue("downloads.folder"),
	},
	discover: {
		source: enumValue<SearchSource>("discover.source", [
			"youtube",
			"soundcloud",
		]),
	},
} as const;
