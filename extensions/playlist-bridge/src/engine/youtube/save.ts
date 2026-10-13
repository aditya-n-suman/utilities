// Create a playlist in the signed-in user's account (port of the web app's save_playlist, which used
// ytmusicapi create_playlist + add_playlist_items). The first batch goes into playlist/create; the rest
// are added 50 at a time so progress can be shown and a failure keeps what was already added.
import { EngineError } from "../errors";
import type { PartialSave, Privacy, SaveProgress, Saved } from "../types";
import { cookieSapisid, NotSignedIn, ytmAuthed, type SapisidLookup } from "./session";

export const SAVE_BATCH = 50;
const PRIVACY: Record<Privacy, string> = { private: "PRIVATE", unlisted: "UNLISTED", public: "PUBLIC" };

export const playlistUrls = (id: string) => ({
  youtube: `https://www.youtube.com/playlist?list=${id}`,
  youtube_music: `https://music.youtube.com/playlist?list=${id}`,
});

/** Where a save got to, so "Add the rest" can continue. */
export interface SaveState {
  playlistId: string | null;
  added: number;
}

export async function savePlaylist(
  videoIds: string[],
  options: { title: string; description?: string; privacy: Privacy },
  state: SaveState,
  onProgress: (p: SaveProgress) => void,
  getSapisid: SapisidLookup = cookieSapisid,
): Promise<Saved | PartialSave> {
  const total = videoIds.length;
  onProgress({ added: state.added, total });

  try {
    if (!state.playlistId) {
      const first = videoIds.slice(0, SAVE_BATCH);
      const title = options.title.replace(/[<>]/g, "").slice(0, 150) || "Converted playlist";
      const created = await ytmAuthed(
        "playlist/create",
        {
          title,
          description: (options.description ?? "Converted from Spotify with Playlist Bridge.").slice(0, 5000),
          privacyStatus: PRIVACY[options.privacy],
          videoIds: first,
        },
        getSapisid,
      );
      if (typeof created?.playlistId !== "string") throw new EngineError("save_failed", "YouTube didn't create the playlist.");
      state.playlistId = created.playlistId;
      state.added = first.length;
      onProgress({ added: state.added, total });
    }

    while (state.added < total) {
      const batch = videoIds.slice(state.added, state.added + SAVE_BATCH);
      const result = await ytmAuthed(
        "browse/edit_playlist",
        {
          playlistId: state.playlistId,
          actions: batch.map((id) => ({ action: "ACTION_ADD_VIDEO", addedVideoId: id, dedupeOption: "DEDUPE_OPTION_SKIP" })),
        },
        getSapisid,
      );
      if (!String(result?.status ?? "").includes("SUCCEEDED")) throw new EngineError("save_failed", "YouTube didn't accept some videos.");
      state.added += batch.length;
      onProgress({ added: state.added, total });
    }
  } catch (e) {
    // Nothing created yet: a plain failure. Some videos added: report a partial save.
    if (!state.playlistId || e instanceof NotSignedIn) throw e;
    return { playlist_id: state.playlistId, urls: playlistUrls(state.playlistId), video_count: state.added, added: state.added, failed: total - state.added };
  }
  return { playlist_id: state.playlistId!, urls: playlistUrls(state.playlistId!), video_count: total };
}
