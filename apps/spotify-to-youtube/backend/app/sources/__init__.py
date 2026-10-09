"""Collect a public Spotify playlist's metadata from Spotify's web surface (no API keys).

Tier 1: embed page (metadata, first 100 tracks, anonymous token)
Tier 2: web player GraphQL paging with that token (tracks 101+)
Tier 3: headless web player, only when tier 2 is broken
"""

import logging
from collections.abc import Callable

import httpx

from ..config import settings
from ..models import Playlist
from .embed import PlaylistUnavailable, SourceChanged, fetch_embed
from .paste import parse_track_text
from .pathfinder import StaleQueryHash, fetch_all_tracks
from .resolve import InvalidPlaylistLink, parse_playlist_id, resolve_playlist_id
from .webplayer import current_query_hash, fetch_with_browser

log = logging.getLogger(__name__)

__all__ = [
    "InvalidPlaylistLink",
    "PlaylistUnavailable",
    "SourceChanged",
    "fetch_playlist",
    "parse_playlist_id",
    "parse_track_text",
]


async def fetch_playlist(
    link: str,
    *,
    max_tracks: int | None = None,
    on_metadata: Callable[[Playlist, bool], None] | None = None,
) -> Playlist:
    """`on_metadata(playlist, loading_more)` fires once the embed page is parsed, before paging."""
    max_tracks = max_tracks or settings.max_tracks
    async with httpx.AsyncClient(timeout=20) as client:
        playlist_id = await resolve_playlist_id(link, client)
        embed = await fetch_embed(playlist_id, client)
        playlist = embed.playlist
        loading_more = embed.maybe_truncated and len(playlist.tracks) < max_tracks
        if on_metadata:
            on_metadata(playlist, loading_more)
        if not loading_more:
            playlist.tracks = playlist.tracks[:max_tracks]
            return playlist

        rest, total = None, None
        if embed.access_token:
            try:
                rest, total = await fetch_all_tracks(
                    playlist_id,
                    embed.access_token,
                    client,
                    start=len(playlist.tracks),
                    max_tracks=max_tracks,
                    query_hash=current_query_hash(),
                )
                playlist.source = "pathfinder"
            except (StaleQueryHash, SourceChanged, httpx.HTTPError) as exc:
                log.warning("pathfinder paging failed (%s); trying browser fallback", exc)

    if rest is None and settings.enable_browser_fallback:
        try:
            tracks, total, _ = await fetch_with_browser(playlist_id, max_tracks=max_tracks)
            playlist.tracks, rest = tracks, []
            playlist.source = "webplayer"
        except Exception as exc:  # keep the 100 tracks we have rather than failing the job
            log.warning("browser fallback failed: %s", exc)

    if rest:
        playlist.tracks.extend(rest)
    playlist.tracks = playlist.tracks[:max_tracks]
    playlist.total = max(total or 0, len(playlist.tracks))
    return playlist
