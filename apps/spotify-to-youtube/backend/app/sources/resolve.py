import re
from urllib.parse import urlparse

import httpx

from ..config import USER_AGENT

_ID = r"[A-Za-z0-9]{22}"
_URI_RE = re.compile(rf"^spotify:playlist:({_ID})$")
_PATH_RE = re.compile(rf"/(?:intl-[a-z]{{2}}(?:-[a-z]{{2}})?/)?(?:embed/)?playlist/({_ID})(?:/|$)", re.I)
_SHORT_HOSTS = {"spotify.link", "spoti.fi"}


class InvalidPlaylistLink(ValueError):
    pass


def parse_playlist_id(link: str) -> str | None:
    """Extract a playlist id from a URL/URI without network access. Returns None for short links."""
    link = link.strip()
    if m := _URI_RE.match(link):
        return m.group(1)
    if re.fullmatch(_ID, link):
        return link
    if not re.match(r"^https?://", link, re.I):
        link = "https://" + link
    parsed = urlparse(link)
    host = (parsed.hostname or "").lower()
    if host in _SHORT_HOSTS:
        return None
    if host not in ("open.spotify.com", "play.spotify.com"):
        raise InvalidPlaylistLink("Not a Spotify playlist link.")
    if m := _PATH_RE.search(parsed.path):
        return m.group(1)
    raise InvalidPlaylistLink("Not a Spotify playlist link.")


async def resolve_playlist_id(link: str, client: httpx.AsyncClient) -> str:
    playlist_id = parse_playlist_id(link)
    if playlist_id:
        return playlist_id
    # Short share links (spotify.link/…) redirect to the canonical open.spotify.com URL.
    url = link if re.match(r"^https?://", link.strip(), re.I) else "https://" + link.strip()
    resp = await client.get(url, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
    playlist_id = parse_playlist_id(str(resp.url))
    if not playlist_id:
        raise InvalidPlaylistLink("Could not resolve the short link to a playlist.")
    return playlist_id
