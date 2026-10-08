"""Output: anonymous temporary playlist links, or a playlist saved to the user's account."""

from ytmusicapi import YTMusic
from ytmusicapi.auth.oauth import OAuthCredentials

TEMP_URL = "https://www.youtube.com/watch_videos?video_ids={ids}"
SAVE_BATCH = 50
PRIVACY = {"private": "PRIVATE", "unlisted": "UNLISTED", "public": "PUBLIC"}


def temp_links(video_ids: list[str], chunk: int = 50) -> list[str]:
    """YouTube's anonymous `watch_videos` playlists. Opened by the user's browser, not our server."""
    return [TEMP_URL.format(ids=",".join(video_ids[i : i + chunk])) for i in range(0, len(video_ids), chunk)]


class SaveFailed(Exception):
    pass


def save_playlist(
    token: dict,
    credentials: OAuthCredentials,
    *,
    title: str,
    description: str,
    privacy: str,
    video_ids: list[str],
) -> str:
    """Create a playlist in the signed-in user's account; returns the playlist id. Blocking."""
    yt = YTMusic(auth=token, oauth_credentials=credentials)
    title = title.replace("<", "").replace(">", "")[:150] or "Converted playlist"
    playlist_id = yt.create_playlist(title, description[:5000], PRIVACY.get(privacy, "PRIVATE"), video_ids[:SAVE_BATCH])
    if not isinstance(playlist_id, str):
        raise SaveFailed(f"YouTube rejected the playlist: {playlist_id}")
    for i in range(SAVE_BATCH, len(video_ids), SAVE_BATCH):
        result = yt.add_playlist_items(playlist_id, video_ids[i : i + SAVE_BATCH], duplicates=True)
        if not (isinstance(result, dict) and "SUCCEEDED" in str(result.get("status", ""))):
            raise SaveFailed(f"Could not add all videos (batch {i // SAVE_BATCH + 1}): {result}")
    return playlist_id


def playlist_urls(playlist_id: str) -> dict[str, str]:
    return {
        "youtube": f"https://www.youtube.com/playlist?list={playlist_id}",
        "youtube_music": f"https://music.youtube.com/playlist?list={playlist_id}",
    }
