import { clamp } from "@/lib/utils";
import { Effects } from "./Effects";
import { Equalizer } from "./Equalizer";
import { TypedEventEmitter } from "./TypedEventEmitter";
import type { Track } from "./types";

// How loudness follows amplitude: about its 0.6 power (Stevens).
const LOUDNESS_EXPONENT = 0.6;

const amplitudeFor = (position: number): number =>
	position ** (1 / LOUDNESS_EXPONENT);

interface AudioPlayerEvents extends Record<string, unknown> {
	trackchange: Track | null;
	play: void;
	pause: void;
	timeupdate: number;
	durationchange: number;
	volumechange: { volume: number; muted: boolean };
	ended: void;
	error: string;
}

export class AudioPlayer extends TypedEventEmitter<AudioPlayerEvents> {
	private audio: HTMLAudioElement;
	private track: Track | null = null;
	readonly equalizer = new Equalizer();
	readonly effects: Effects;
	private position = 1;
	private context: AudioContext | null = null;
	private analyserNode: AnalyserNode | null = null;
	private buildingGraph = false;

	constructor() {
		super();
		this.audio = new Audio();
		this.audio.preload = "metadata";
		// Must be set before any src: the proxy is a different origin, and Web Audio
		// refuses to expose samples from a media element that wasn't fetched
		// CORS-clean.
		this.audio.crossOrigin = "anonymous";
		this.effects = new Effects(this.audio);

		this.audio.addEventListener("play", () => this.emit("play", undefined));
		this.audio.addEventListener("pause", () => this.emit("pause", undefined));
		this.audio.addEventListener("ended", () => this.emit("ended", undefined));
		this.audio.addEventListener("timeupdate", () =>
			this.emit("timeupdate", this.audio.currentTime),
		);
		this.audio.addEventListener("durationchange", () => {
			if (Number.isFinite(this.audio.duration)) {
				this.emit("durationchange", this.audio.duration);
			}
		});
		this.audio.addEventListener("volumechange", () =>
			this.emit("volumechange", {
				volume: this.position,
				muted: this.audio.muted,
			}),
		);
		this.audio.addEventListener("error", () => {
			const message =
				this.audio.error?.message || "This file could not be played.";
			this.emit("error", message);
		});
	}

	get currentTrack(): Track | null {
		return this.track;
	}

	get analyser(): AnalyserNode | null {
		return this.analyserNode;
	}

	get currentTime(): number {
		return this.audio.currentTime;
	}

	get duration(): number {
		return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
	}

	get isPlaying(): boolean {
		return !this.audio.paused && !this.audio.ended;
	}

	get volume(): number {
		return this.position;
	}

	get muted(): boolean {
		return this.audio.muted;
	}

	load(track: Track | null): void {
		this.track = track;
		if (track) {
			this.audio.src = track.src;
		} else {
			this.audio.removeAttribute("src");
			this.audio.load();
		}
		this.emit("trackchange", track);
	}

	async play(): Promise<void> {
		if (!this.track) return;
		void this.ensureAnalyser();
		try {
			await this.audio.play();
		} catch (err) {
			this.emit("error", err instanceof Error ? err.message : String(err));
		}
	}

	private async ensureAnalyser(): Promise<void> {
		if (this.context) {
			if (this.context.state === "suspended") {
				await this.context.resume().catch(() => {});
			}
			return;
		}

		if (this.buildingGraph) return;
		this.buildingGraph = true;

		let context: AudioContext | null = null;
		let source: MediaElementAudioSourceNode | null = null;
		try {
			context = new AudioContext();
			await context.resume();
			if (context.state !== "running") {
				void context.close().catch(() => {});
				return;
			}
			source = context.createMediaElementSource(this.audio);
			const analyser = context.createAnalyser();
			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = 0.2;
			const equalized = this.equalizer.attach(context, source);
			this.effects.attach(context, equalized).connect(analyser);
			analyser.connect(context.destination);
			context.addEventListener("statechange", () => {
				if (this.context?.state === "suspended") {
					void this.context.resume().catch(() => {});
				}
			});
			this.context = context;
			this.analyserNode = analyser;
		} catch {
			this.analyserNode = null;
			this.equalizer.release();
			this.effects.release();
			if (source && context) {
				try {
					source.disconnect();
					source.connect(context.destination);
					this.context = context;
				} catch {
				}
			} else {
				void context?.close().catch(() => {});
			}
		} finally {
			this.buildingGraph = false;
		}
	}

	pause(): void {
		this.audio.pause();
	}

	async toggle(): Promise<void> {
		if (this.isPlaying) {
			this.pause();
		} else {
			await this.play();
		}
	}

	seek(seconds: number): void {
		if (!this.track) return;
		const max = this.duration || seconds;
		this.audio.currentTime = Math.min(Math.max(seconds, 0), max);
	}

	setVolume(position: number): void {
		this.position = clamp(position, 0, 1, this.position);
		this.audio.volume = amplitudeFor(this.position);
	}

	setMuted(muted: boolean): void {
		this.audio.muted = muted;
	}
}
