"""Tier 2: page through the web player's GraphQL endpoint with the embed's anonymous token."""

import httpx

from ..config import USER_AGENT, settings
from ..models import Track
from .embed import PlaylistUnavailable, SourceChanged

PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v2/query"
PAGE_SIZE = 100


class StaleQueryHash(Exception):
    """Spotify rejected the persisted query hash (it rotates with web player releases)."""


def fetch_playlist_body(playlist_id: str, offset: int, limit: int, query_hash: str) -> dict:
    return {
        "variables": {
            "uri": f"spotify:playlist:{playlist_id}",
            "offset": offset,
            "limit": limit,
            "enableWatchFeedEntrypoint": False,
            "includeEpisodeContentRatingsV2": True,
        },
        "operationName": "fetchPlaylist",
        "extensions": {"persistedQuery": {"version": 1, "sha256Hash": query_hash}},
    }


def _sources_url(cover: dict | None) -> str | None:
    sources = (cover or {}).get("sources") or []
    if not sources:
        return None
    return max(sources, key=lambda s: (s.get("width") or 0))["url"]


def parse_playlist_items(items: list[dict]) -> list[Track]:
    tracks = []
    for item in items:
        data = ((item.get("itemV2") or {}).get("data")) or {}
        if data.get("__typename") != "Track" or not data.get("name"):
            continue  # podcast episodes, local files, unavailable entries
        album = data.get("albumOfTrack") or {}
        tracks.append(
            Track(
                title=data["name"],
                artists=[a["profile"]["name"] for a in (data.get("artists") or {}).get("items", []) if a.get("profile")],
                album=album.get("name"),
                duration_ms=(data.get("trackDuration") or {}).get("totalMilliseconds"),
                explicit=(data.get("contentRating") or {}).get("label") == "EXPLICIT",
                spotify_uri=data.get("uri"),
                cover_url=_sources_url(album.get("coverArt")),
            )
        )
    return tracks


def parse_page(payload: dict) -> tuple[list[Track], int, dict]:
    """Returns (tracks, total_count, playlist_v2) for one fetchPlaylist response."""
    if payload.get("errors") and not payload.get("data"):
        messages = " ".join(str(e.get("message", "")) for e in payload["errors"])
        if "query hash" in messages.lower() or "persisted" in messages.lower():
            raise StaleQueryHash(messages)
        raise SourceChanged(messages)
    playlist = ((payload.get("data") or {}).get("playlistV2")) or {}
    if playlist.get("__typename") in ("GenericError", "NotFound"):
        raise PlaylistUnavailable(playlist.get("message") or "Playlist not found or not public.")
    content = playlist.get("content")
    if not content:
        raise SourceChanged(f"Unexpected fetchPlaylist response ({playlist.get('__typename')}).")
    return parse_playlist_items(content.get("items", [])), int(content.get("totalCount") or 0), playlist


async def fetch_all_tracks(
    playlist_id: str,
    access_token: str,
    client: httpx.AsyncClient,
    *,
    start: int = 0,
    max_tracks: int | None = None,
    query_hash: str | None = None,
) -> tuple[list[Track], int]:
    """Fetch tracks from `start` until the end (or `max_tracks`). Returns (tracks, total_count)."""
    query_hash = query_hash or settings.spotify_fetch_playlist_hash
    headers = {
        "Authorization": f"Bearer {access_token}",
        "User-Agent": USER_AGENT,
        "app-platform": "WebPlayer",
        "Content-Type": "application/json;charset=UTF-8",
    }
    tracks: list[Track] = []
    offset, total = start, None
    while total is None or offset < total:
        if max_tracks is not None and start + len(tracks) >= max_tracks:
            break
        resp = await client.post(
            PATHFINDER_URL, json=fetch_playlist_body(playlist_id, offset, PAGE_SIZE, query_hash), headers=headers
        )
        if resp.status_code == 412 or "query hash" in resp.text[:200].lower():
            raise StaleQueryHash(resp.text[:200])
        resp.raise_for_status()
        page, total, _ = parse_page(resp.json())
        tracks.extend(page)
        offset += PAGE_SIZE
    return tracks, total or 0
