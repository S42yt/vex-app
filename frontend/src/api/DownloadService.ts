import { storage } from "@/lib/storage";
import type { Track } from "@/player/types";
import { backend, failureOf } from "./rpc";
import { Store } from "@/lib/store";

export interface DownloadState {
	activeIds: readonly string[];
	done: { trackId: string; path: string } | null;
	error: { trackId: string; message: string } | null;
}

const NOTICE_MS = 6000;

export class DownloadService extends Store<DownloadState> {
	protected snapshot: DownloadState = { activeIds: [], error: null, done: null };

	download = async (track: Track): Promise<void> => {
		if (this.snapshot.activeIds.includes(track.id)) return;
		this.update({ activeIds: [...this.snapshot.activeIds, track.id] });
		let message: string | null = null;
		let done: DownloadState["done"] = null;
		try {
			const saved = await backend.Download.SaveTrack({
				id: track.id,
				fileName: track.artist
					? `${track.artist} - ${track.title}`
					: track.title,
				startingFolder: storage.downloads.folder.get() ?? undefined,
			});
			if (saved.path) {
				done = { trackId: track.id, path: saved.path };
				if (saved.folder) storage.downloads.folder.set(saved.folder);
			}
		} catch (err) {
			message = failureOf(err).error;
		}
		const standing = this.snapshot.error;
		this.update({
			activeIds: this.snapshot.activeIds.filter((id) => id !== track.id),
			error: message
				? { trackId: track.id, message }
				: standing?.trackId === track.id
					? null
					: standing,
			done: done ?? this.snapshot.done,
		});
		if (done) {
			const shown = done;
			setTimeout(() => {
				if (this.snapshot.done === shown) this.update({ done: null });
			}, NOTICE_MS);
		}
	};
}

export const downloadService = new DownloadService();
