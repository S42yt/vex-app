import { storage } from "@/lib/storage";
import { AudioPlayer } from "./AudioPlayer";
import { PlaybackQueue } from "./PlaybackQueue";
import type { Effects } from "./Effects";
import type { Equalizer } from "./Equalizer";
import type { PlayerState, RepeatMode, Track } from "./types";
import { Store } from "@/lib/store";

const REPEAT_CYCLE: RepeatMode[] = ["off", "all", "one"];

export class PlayerController extends Store<PlayerState> {
	private player = new AudioPlayer();
	private queue = new PlaybackQueue();
	private queueContext: string | null = null;
	private error: string | null = null;
	protected snapshot: PlayerState;

	constructor() {
		super();
		this.restoreSettings();
		this.snapshot = this.buildSnapshot();

		this.player.on("play", () => this.refresh());
		this.player.on("pause", () => this.refresh());
		this.player.on("timeupdate", () => this.refresh());
		this.player.on("volumechange", () => this.refresh());
		this.player.on("sourcechange", () => this.refresh());

		this.player.on("durationchange", (duration) => {
			const current = this.queue.current;
			if (current && current.durationSec === 0 && duration > 0) {
				this.queue.updateTrack(current.id, { durationSec: duration });
			}
			this.refresh();
		});

		this.player.on("ended", () => {
			if (this.queue.repeatMode === "one") {
				this.player.seek(0);
				void this.player.play();
				return;
			}
			const next = this.queue.next(true);
			this.load(next);
			if (next) void this.player.play();
			this.refresh();
		});

		this.player.on("error", (message) => {
			this.error = message;
			this.refresh();
		});

		this.player.equalizer.subscribe(() => this.persistEqualizer());
	}

	get analyser(): AnalyserNode | null {
		return this.player.analyser;
	}

	get equalizer(): Equalizer {
		return this.player.equalizer;
	}

	get effects(): Effects {
		return this.player.effects;
	}

	get queueContextId(): string | null {
		return this.queueContext;
	}

	playCollection(contextId: string, tracks: Track[], index = -1): void {
		this.queueContext = contextId;
		this.queue.replace(tracks, index);
		this.queue.restartShuffle();
		this.startCurrent();
	}

	playOrToggleCollection(contextId: string, tracks: Track[]): void {
		if (this.queueContext === contextId) {
			this.togglePlay();
			return;
		}
		this.playCollection(contextId, tracks);
	}

	syncCollection(contextId: string, tracks: Track[]): void {
		if (this.queueContext !== null && this.queueContext !== contextId) return;
		this.queueContext = contextId;
		const current = this.queue.current;
		const index = current
			? tracks.findIndex((track) => track.id === current.id)
			: -1;
		this.queue.replace(tracks, index);
		if (current && index === -1) {
			this.load(null);
		} else if (!current && tracks.length > 0) {
			this.load(this.queue.start());
		}
		this.refresh();
	}

	clearQueue(): void {
		this.queueContext = null;
		this.queue.replace([], -1);
		this.load(null);
		this.refresh();
	}

	updateTrack(id: string, patch: Partial<Track>): void {
		this.queue.updateTrack(id, patch);
		this.refresh();
	}

	removeTracks(predicate: (track: Track) => boolean): void {
		const current = this.queue.current;
		const removed = this.queue.removeMatching(predicate);
		if (removed.length === 0) return;
		if (current && removed.includes(current)) {
			this.load(this.queue.current);
		}
		this.refresh();
	}

	togglePlay(): void {
		if (!this.queue.current && this.queue.tracks.length > 0) {
			this.queue.start();
			this.startCurrent();
			return;
		}
		void this.player.toggle();
	}

	next(): void {
		const track = this.queue.next(false);
		if (!track) return;
		const wasPlaying = this.player.isPlaying;
		this.load(track);
		if (wasPlaying) void this.player.play();
		this.refresh();
	}

	previous(): void {
		if (this.player.currentTime > 3) {
			this.player.seek(0);
			return;
		}
		const track = this.queue.previous();
		if (!track) return;
		const wasPlaying = this.player.isPlaying;
		this.load(track);
		if (wasPlaying) void this.player.play();
		this.refresh();
	}

	seek(seconds: number): void {
		this.player.seek(seconds);
	}

	setVolume(volume: number): void {
		this.player.setVolume(volume);
		if (volume > 0) this.player.setMuted(false);
		this.persistSettings();
	}

	toggleMute(): void {
		this.player.setMuted(!this.player.muted);
		this.persistSettings();
	}

	cycleRepeatMode(): void {
		const current = REPEAT_CYCLE.indexOf(this.queue.repeatMode);
		this.queue.setRepeatMode(
			REPEAT_CYCLE[(current + 1) % REPEAT_CYCLE.length],
		);
		this.persistSettings();
		this.refresh();
	}

	toggleShuffle(): void {
		this.queue.setShuffled(!this.queue.shuffled);
		this.persistSettings();
		this.refresh();
	}

	private load(track: Track | null): void {
		this.player.load(track?.src ?? null);
	}

	private startCurrent(): void {
		const track = this.queue.current ?? this.queue.start();
		this.load(track);
		if (track) {
			this.error = null;
			void this.player.play();
		}
		this.refresh();
	}

	private restoreSettings(): void {
		const volume = storage.player.volume.get();
		if (volume !== null) this.player.setVolume(volume);
		if (storage.player.muted.get()) this.player.setMuted(true);
		const repeat = storage.player.repeat.get();
		if (repeat !== null) this.queue.setRepeatMode(repeat);
		if (storage.player.shuffle.get()) this.queue.setShuffled(true);

		this.player.equalizer.restore({
			enabled: storage.equalizer.enabled.get(),
			gains: storage.equalizer.gains.get(),
		});
	}

	private persistSettings(): void {
		storage.player.volume.set(this.player.volume);
		storage.player.muted.set(this.player.muted);
		storage.player.repeat.set(this.queue.repeatMode);
		storage.player.shuffle.set(this.queue.shuffled);
	}

	private persistEqualizer(): void {
		const { enabled, gains } = this.player.equalizer.getSnapshot();
		storage.equalizer.enabled.set(enabled);
		storage.equalizer.gains.set(gains);
	}

	private buildSnapshot(): PlayerState {
		const current = this.queue.current;
		return {
			queueContextId: this.queueContext,
			tracks: this.queue.tracks,
			currentTrack: current,
			currentIndex: this.queue.currentIndex,
			isPlaying: this.player.isPlaying,
			currentTimeSec: this.player.currentTime,
			durationSec: this.player.duration || current?.durationSec || 0,
			volume: this.player.volume,
			muted: this.player.muted,
			repeatMode: this.queue.repeatMode,
			shuffled: this.queue.shuffled,
			error: this.error,
		};
	}

	private refresh(): void {
		this.publish(this.buildSnapshot());
	}
}

export const playerController = new PlayerController();
