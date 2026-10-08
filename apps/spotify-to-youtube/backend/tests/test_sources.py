import json
from pathlib import Path

import pytest

from app.sources.embed import PlaylistUnavailable, SourceChanged, parse_embed_html
from app.sources.pathfinder import StaleQueryHash, parse_page
from app.sources.resolve import InvalidPlaylistLink, parse_playlist_id

FIXTURES = Path(__file__).parent / "fixtures"
PID = "37i9dQZF1DXcBWIGoYBM5M"


@pytest.mark.parametrize(
    "link",
    [
        f"https://open.spotify.com/playlist/{PID}",
        f"https://open.spotify.com/playlist/{PID}?si=abc123&pi=x",
        f"open.spotify.com/playlist/{PID}",
        f"https://open.spotify.com/intl-de/playlist/{PID}",
        f"https://open.spotify.com/intl-pt-br/playlist/{PID}",
        f"https://open.spotify.com/embed/playlist/{PID}",
        f"spotify:playlist:{PID}",
        PID,
        f"  https://open.spotify.com/playlist/{PID}/  ",
    ],
)
def test_parse_playlist_id(link):
    assert parse_playlist_id(link) == PID


def test_short_links_need_resolution():
    assert parse_playlist_id("https://spotify.link/AbCdEf") is None


@pytest.mark.parametrize(
    "link",
    ["https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX", "https://youtube.com/playlist?list=x", "hello"],
)
def test_rejects_non_playlists(link):
    with pytest.raises(InvalidPlaylistLink):
        parse_playlist_id(link)


def test_parse_embed_fixture():
    result = parse_embed_html((FIXTURES / "embed_playlist.html").read_text(), PID)
    pl = result.playlist
    assert pl.name == "Today’s Top Hits"
    assert pl.owner == "Spotify"
    assert pl.source == "embed"
    assert len(pl.tracks) == pl.total == 50
    first = pl.tracks[0]
    assert first.title == "Patient Zero" and first.artists == ["Taylor Swift"]
    assert first.duration_ms == 225868 and first.spotify_uri.startswith("spotify:track:")
    assert pl.cover_url.startswith("https://")
    assert result.access_token == "REDACTED_TEST_TOKEN"
    assert not result.maybe_truncated


def test_embed_without_entity_is_unavailable():
    html = '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"status":500}}}</script>'
    with pytest.raises(PlaylistUnavailable):
        parse_embed_html(html)


def test_embed_without_next_data_is_source_change():
    with pytest.raises(SourceChanged):
        parse_embed_html("<html></html>")


def test_parse_pathfinder_page():
    payload = json.loads((FIXTURES / "pathfinder_fetchPlaylist.json").read_text())
    tracks, total, meta = parse_page(payload)
    assert total == 150 and meta["name"] == "All Out 80s"
    assert len(tracks) == 5
    t = tracks[0]
    assert (t.title, t.artists, t.album) == ("La Isla Bonita", ["Madonna"], "True Blue")
    assert t.duration_ms == 242733 and t.cover_url.startswith("https://i.scdn.co/")


def test_pathfinder_errors():
    missing = {"data": {"playlistV2": {"__typename": "GenericError", "message": "Failed to fetch playlist"}}}
    with pytest.raises(PlaylistUnavailable):
        parse_page(missing)
    with pytest.raises(StaleQueryHash):
        parse_page({"errors": [{"message": "Invalid query hash"}]})
    with pytest.raises(SourceChanged):
        parse_page({"data": {"playlistV2": {"__typename": "Playlist"}}})
