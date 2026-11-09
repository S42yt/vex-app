// Can Go limit constants be generated from contract.ts? Only two MAX_ are exported; the rest live in schemas.
import { z } from "../../node_modules/zod";
import * as C from "../../contract/contract";
const s = (schema: any) => z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }) as any;
const track = s(C.CreateTrackRequest).properties;
const login = s(C.LoginRequest).properties;
const pl = s(C.CreatePlaylistRequest).properties;
const out = {
	MaxAudioBase64: C.MAX_AUDIO_BASE64, MaxImageBase64: C.MAX_IMAGE_BASE64,
	MaxNameLength: track.title.maxLength, MaxDurationMs: track.duration.maximum,
	MaxArtistsPerTrack: track.artistIds.maxItems, MaxUsernameLength: login.username.maxLength,
	MaxPasswordLength: login.password.maxLength, MaxTracksPerPlaylist: pl.trackIds?.maxItems,
};
console.log(Object.entries(out).map(([k, v]) => `\t${k} = ${v}`).join("\n"));
