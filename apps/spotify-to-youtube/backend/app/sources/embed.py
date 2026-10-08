"""Tier 1: the public embed page (open.spotify.com/embed/playlist/<id>).

The server-rendered page carries a Next.js `__NEXT_DATA__` blob with playlist metadata, the first
100 tracks and an anonymous access token that tier 2 reuses for paging.
"""

import json
import re
from dataclasses import dataclass

import httpx

from ..config import USER_AGENT
from ..models import Playlist, Track

EMBED_URL = "https://open.spotify.com/embed/playlist/{id}"
EMBED_TRACK_CAP = 100
_NEXT_DATA_RE = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)


class PlaylistUnavailable(Exception):
    """The playlist is private, deleted, or otherwise not publicly visible."""


class SourceChanged(Exception):
    """Spotify's page/response shape no longer matches what we parse."""


@dataclass
class EmbedResult:
    playlist: Playlist
    access_token: str | None

    @property
    def maybe_truncated(self) -> bool:
        return len(self.playlist.tracks) >= EMBED_TRACK_CAP


def _largest_image(sources: list[dict] | None) -> str | None:
    if not sources:
        return None
    return max(sources, key=lambda s: (s.get("width") or 0))["url"]


def parse_embed_html(html: str, playlist_id: str | None = None) -> EmbedResult:
    m = _NEXT_DATA_RE.search(html)
    if not m:
        raise SourceChanged("Embed page has no __NEXT_DATA__ block.")
    data = json.loads(m.group(1))
    state = data.get("props", {}).get("pageProps", {}).get("state") or {}
    entity = (state.get("data") or {}).get("entity")
    if not entity:
        raise PlaylistUnavailable("Playlist not found or not public.")
    if entity.get("type") != "playlist":
        raise PlaylistUnavailable("Link is not a playlist.")

    tracks = [
        Track(
            title=t["title"],
            # The embed only exposes a display string; split on the separator Spotify uses.
            artists=[a for a in (t.get("subtitle") or "").split(", ") if a],
            duration_ms=t.get("duration"),
            explicit=bool(t.get("isExplicit")),
            spotify_uri=t.get("uri"),
        )
        for t in entity.get("trackList", [])
        if t.get("entityType", "track") == "track" and t.get("title")
    ]
    session = (state.get("settings") or {}).get("session") or {}
    playlist = Playlist(
        id=playlist_id or entity.get("id"),
        name=entity.get("name") or entity.get("title") or "Spotify playlist",
        owner=entity.get("subtitle"),
        cover_url=_largest_image((entity.get("coverArt") or {}).get("sources")),
        total=len(tracks),
        source="embed",
        tracks=tracks,
    )
    return EmbedResult(playlist=playlist, access_token=session.get("accessToken"))


async def fetch_embed(playlist_id: str, client: httpx.AsyncClient) -> EmbedResult:
    resp = await client.get(EMBED_URL.format(id=playlist_id), headers={"User-Agent": USER_AGENT})
    if resp.status_code in (400, 404):
        raise PlaylistUnavailable("Playlist not found or not public.")
    resp.raise_for_status()
    return parse_embed_html(resp.text, playlist_id)
