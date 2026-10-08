import pytest

from app.cache import MatchCache
from app.models import Candidate, Track
from app.youtube.search import Searcher, SearchFailed

TRACK = Track(title="Take On Me", artists=["a-ha"], duration_ms=225_000)


def c(vid, title, channel, dur, source):
    return Candidate(video_id=vid, title=title, channel=channel, duration_s=dur, source=source)


class FakeSearcher(Searcher):
    def __init__(self, songs=None, videos=None, plain=None, cache=None, fail=()):
        super().__init__(cache, retries=0)
        self.results = {"songs": songs or [], "videos": videos or [], "plain": plain or []}
        self.fail, self.calls = set(fail), []

    def _ytm_search(self, query, kind, limit=5):
        self.calls.append(kind)
        if kind in self.fail:
            raise RuntimeError("boom")
        return self.results[kind]

    def _ytdlp_search(self, query, limit=5):
        self.calls.append("plain")
        if "plain" in self.fail:
            raise RuntimeError("boom")
        return self.results["plain"]


async def test_stops_after_good_song_result():
    s = FakeSearcher(songs=[c("song", "Take On Me", "a-ha", 225, "ytmusic_song")])
    ranked = await s.find(TRACK)
    assert ranked[0].video_id == "song" and s.calls == ["songs"]


async def test_falls_through_layers_when_songs_empty():
    s = FakeSearcher(videos=[c("weak", "Take On Me (Karaoke)", "Sing King", 230, "ytmusic_video")],
                     plain=[c("yt", "a-ha - Take On Me (Official Video)", "a-ha", 226, "ytdlp")])
    ranked = await s.find(TRACK)
    assert s.calls == ["songs", "videos", "plain"]
    assert ranked[0].video_id == "yt"


async def test_layer_errors_are_tolerated_but_total_failure_raises():
    s = FakeSearcher(plain=[c("yt", "a-ha - Take On Me", "a-ha", 226, "ytdlp")], fail={"songs", "videos"})
    assert (await s.find(TRACK))[0].video_id == "yt"
    with pytest.raises(SearchFailed):
        await FakeSearcher(fail={"songs", "videos", "plain"}).find(TRACK)


async def test_nothing_found_is_empty_not_error():
    assert await FakeSearcher().find(TRACK) == []


async def test_songs_breaker_skips_dead_catalog():
    s = FakeSearcher(videos=[c("v", "Take On Me", "a-ha", 225, "ytmusic_video")])
    for _ in range(3):
        await s.find(TRACK)
    s.calls.clear()
    await s.find(TRACK)
    assert "songs" not in s.calls


async def test_cache_short_circuits(tmp_path):
    cache = MatchCache(tmp_path / "c.sqlite3", ttl_days=1)
    s = FakeSearcher(songs=[c("song", "Take On Me", "a-ha", 225, "ytmusic_song")], cache=cache)
    await s.find(TRACK)
    s.calls.clear()
    again = await s.find(Track(title="Take On Me - 2015 Remaster", artists=["a-ha"], duration_ms=226_000))
    assert again[0].video_id == "song" and s.calls == []
