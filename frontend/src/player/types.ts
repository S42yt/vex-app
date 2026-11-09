export interface Track {
	id: string;
	title: string;
	artist?: string;
	album?: string;
	durationSec: number;
	coverUrl?: string;
	src: string;
}

export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
	queueContextId: string | null;
	tracks: readonly Track[];
	currentTrack: Track | null;
	currentIndex: number;
	isPlaying: boolean;
	currentTimeSec: number;
	durationSec: number;
	volume: number;
	muted: boolean;
	repeatMode: RepeatMode;
	shuffled: boolean;
	error: string | null;
}
