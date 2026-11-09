import { ShuffleHistory } from "./ShuffleHistory";
import type { RepeatMode, Track } from "./types";

export class PlaybackQueue {
	private items: Track[] = [];
	private index = -1;
	private repeat: RepeatMode = "off";
	private shuffle = false;
	private history = new ShuffleHistory();

	get tracks(): readonly Track[] {
		return this.items;
	}

	get currentIndex(): number {
		return this.index;
	}

	get current(): Track | null {
		return this.items[this.index] ?? null;
	}

	get repeatMode(): RepeatMode {
		return this.repeat;
	}

	setRepeatMode(mode: RepeatMode): void {
		this.repeat = mode;
	}

	get shuffled(): boolean {
		return this.shuffle;
	}

	setShuffled(on: boolean): void {
		this.shuffle = on;
		if (on) this.restartShuffle();
	}

	restartShuffle(): void {
		this.history.restart(this.current);
	}

	replace(tracks: Track[], index: number): void {
		this.items = [...tracks];
		this.index =
			index >= 0 && index < this.items.length ? index : -1;
	}

	removeMatching(predicate: (track: Track) => boolean): Track[] {
		const removed: Track[] = [];
		const kept: Track[] = [];
		let keptBeforeCurrent = 0;
		for (const [i, track] of this.items.entries()) {
			if (predicate(track)) {
				removed.push(track);
			} else {
				kept.push(track);
				if (i < this.index) keptBeforeCurrent += 1;
			}
		}
		if (removed.length === 0) return removed;
		const current = this.current;
		this.items = kept;
		if (current) {
			this.index = predicate(current)
				? Math.min(keptBeforeCurrent, kept.length - 1)
				: keptBeforeCurrent;
		}
		return removed;
	}

	start(): Track | null {
		if (!this.shuffle) return this.jumpTo(0);
		this.history.restart(null);
		return this.jumpToTrack(this.history.next(this.items, false));
	}

	private jumpTo(position: number): Track | null {
		if (position < 0 || position >= this.items.length) return null;
		this.index = position;
		return this.current;
	}

	private jumpToTrack(track: Track | null): Track | null {
		return track ? this.jumpTo(this.items.indexOf(track)) : null;
	}

	updateTrack(id: string, patch: Partial<Track>): void {
		this.items = this.items.map((t) => (t.id === id ? { ...t, ...patch } : t));
	}

	next(wrap: boolean): Track | null {
		if (this.items.length === 0) return null;
		if (this.shuffle) return this.nextShuffled(wrap);
		const atEnd = this.index >= this.items.length - 1;
		if (atEnd && wrap && this.repeat !== "all") {
			this.index = -1;
			return null;
		}
		this.index = atEnd ? 0 : this.index + 1;
		return this.current;
	}

	previous(): Track | null {
		if (this.items.length === 0) return null;
		if (this.shuffle) {
			return this.jumpToTrack(
				this.index < 0
					? this.history.current(this.items)
					: this.history.previous(this.items),
			);
		}
		this.index = this.index <= 0 ? this.items.length - 1 : this.index - 1;
		return this.current;
	}

	private nextShuffled(wrap: boolean): Track | null {
		const track = this.history.next(
			this.items,
			wrap && this.repeat !== "all",
		);
		if (!track) {
			this.index = -1;
			return null;
		}
		return this.jumpToTrack(track);
	}
}
