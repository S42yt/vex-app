import { useEffect, useState } from "react";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { artistQueueContext, artistService } from "@/api/ArtistService";
import { openIdOf } from "@/api/NavigationService";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ArtistDetail } from "@/components/ArtistDetail";
import { ArtistDialog } from "@/components/ArtistDialog";
import {
	CollectionCard,
	CollectionCardActions,
} from "@/components/CollectionCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NowPlayingRing } from "@/components/NowPlayingRing";
import { SearchInput } from "@/components/SearchInput";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useArtists } from "@/hooks/useArtists";
import { useNavigation } from "@/hooks/useNavigation";
import { usePlayer } from "@/hooks/usePlayer";
import { countLabel, trackCountLabel } from "@/lib/utils";
import type { RemoteArtist } from "@/api/types";

export function ArtistsView() {
	const { artists: state, service } = useArtists();
	const { view, service: navigation } = useNavigation();
	const { state: playerState } = usePlayer();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<RemoteArtist | null>(null);
	const [pendingDelete, setPendingDelete] = useState<RemoteArtist | null>(null);
	const [query, setQuery] = useState("");

	const openCreate = () => {
		setEditing(null);
		setDialogOpen(true);
	};
	const openEdit = (artist: RemoteArtist) => {
		setEditing(artist);
		setDialogOpen(true);
	};

	const openId = openIdOf(view);
	const open =
		openId !== null
			? (state.artists.find((artist) => artist.id === openId) ?? null)
			: null;

	useEffect(() => {
		if (openId !== null && open === null) navigation.openArtist(null);
	}, [openId, open, navigation]);

	const needle = query.trim().toLowerCase();
	const visible = needle
		? state.artists.filter((artist) =>
				artist.name.toLowerCase().includes(needle),
			)
		: state.artists;

	const firstLoad = state.loading && state.artists.length === 0;

	return (
		<div className="flex h-full flex-col">
			{open ? (
				<ArtistDetail
					artist={open}
					onBack={() => navigation.openArtist(null)}
					onEdit={() => openEdit(open)}
				/>
			) : (
				<>
					<div className="flex items-center gap-3 px-4 py-2.5">
						<h2 className="shrink-0 text-sm font-semibold">Artists</h2>
						{state.artists.length > 0 && (
							<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
								{countLabel(state.artists.length, "artist")}
							</span>
						)}
						<div className="ml-auto flex items-center gap-2">
							{state.artists.length > 0 && (
								<SearchInput
									value={query}
									onChange={setQuery}
									label="Search artists"
									className="w-40 min-w-0"
								/>
							)}
							<Button variant="secondary" size="sm" onClick={openCreate}>
								<Plus className="h-4 w-4" />
								New artist
							</Button>
						</div>
					</div>
					<Separator />

					<ErrorBanner error={state.error} className="border-b" />

					{firstLoad ? (
						<div className="flex flex-1 items-center justify-center text-muted-foreground">
							<Loader2 className="h-6 w-6 animate-spin" />
						</div>
					) : state.artists.length === 0 ? (
						<EmptyState
							framed
							icon={<Users className="h-9 w-9" />}
							title="No artists yet — create one to get started."
						/>
					) : visible.length === 0 ? (
						<EmptyState
							icon={<Search className="h-8 w-8" />}
							title={`No artists match “${query}”.`}
						/>
					) : (
						<ScrollArea className="min-h-0 flex-1">
							<ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-4">
								{visible.map((artist) => {
									const ownsQueue =
										playerState.queueContextId ===
										artistQueueContext(artist.id);
									const playing = ownsQueue && playerState.isPlaying;
									const count = artistService.tracksOf(artist).length;
									return (
										<li key={artist.id}>
											<CollectionCard
												shape="round"
												artwork={
													<>
														<NowPlayingRing
															ownsQueue={ownsQueue}
															playing={playing}
															round
														/>
														<ArtistAvatar
															imageUrl={artist.imageUrl}
															className="aspect-square w-full ring-1 ring-inset ring-border/60"
															iconClassName="h-9 w-9"
														/>
													</>
												}
												name={artist.name}
												meta={trackCountLabel(count)}
												ownsQueue={ownsQueue}
												playing={playing}
												playLabel={
													playing
														? `Pause ${artist.name}`
														: `Play ${artist.name}`
												}
												onOpen={() => navigation.openArtist(artist.id)}
												onPlay={
													count > 0
														? () => artistService.playOrToggle(artist)
														: undefined
												}
												actions={
													<CollectionCardActions
														name={artist.name}
														onEdit={() => openEdit(artist)}
														onDelete={() => setPendingDelete(artist)}
													/>
												}
											/>
										</li>
									);
								})}
							</ul>
						</ScrollArea>
					)}
				</>
			)}

			<ArtistDialog
				artist={editing}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
			/>

			<ConfirmDialog
				open={pendingDelete !== null}
				onOpenChange={(next) => {
					if (!next) setPendingDelete(null);
				}}
				title="Delete artist?"
				description={`Removes “${pendingDelete?.name}” from the server. Its tracks are kept, but lose the credit.`}
				onConfirm={() => {
					if (pendingDelete) void service.remove(pendingDelete.id);
				}}
			/>
		</div>
	);
}
