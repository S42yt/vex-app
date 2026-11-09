import type { Track } from "./types";

export class ShuffleHistory {
	private played: string[] = [];
	private thisRound = new Set<string>();
	private back = 0;

	restart(playing: Track | null): void {
		this.played = [];
		this.thisRound.clear();
		this.back = 0;
		if (playing) this.record(playing.id);
	}

	next(items: readonly Track[], stopAtRoundEnd: boolean): Track | null {
		if (items.length === 0) return null;
		const replayed = this.stepForward(items);
		if (replayed) return replayed;
		if (stopAtRoundEnd && this.roundComplete(items)) return null;
		const drawn = this.draw(items);
		this.record(drawn.id);
		return drawn;
	}

	current(items: readonly Track[]): Track | null {
		return this.at(items, this.back);
	}

	previous(items: readonly Track[]): Track | null {
		for (let back = this.back + 1; back < this.played.length; back++) {
			const track = this.at(items, back);
			if (track) {
				this.back = back;
				return track;
			}
		}
		return null;
	}

	private draw(items: readonly Track[]): Track {
		if (this.roundComplete(items)) this.thisRound.clear();
		const due = items.filter((track) => !this.thisRound.has(track.id));
		const gap = Math.floor(items.length / 2);
		const recent = new Set(this.played.slice(this.played.length - gap));
		const spaced = due.filter((track) => !recent.has(track.id));
		const pool = spaced.length > 0 ? spaced : due;
		return pool[Math.floor(Math.random() * pool.length)];
	}

	private roundComplete(items: readonly Track[]): boolean {
		return items.every((track) => this.thisRound.has(track.id));
	}

	private at(items: readonly Track[], back: number): Track | null {
		const id = this.played[this.played.length - 1 - back];
		return items.find((track) => track.id === id) ?? null;
	}

	private stepForward(items: readonly Track[]): Track | null {
		while (this.back > 0) {
			this.back -= 1;
			const track = this.at(items, this.back);
			if (track) return track;
		}
		return null;
	}

	private record(id: string): void {
		this.played.push(id);
		this.thisRound.add(id);
	}
}
