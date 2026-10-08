"""Find YouTube candidates for a track via ytmusicapi, falling back to yt-dlp search.

Layers (stop as soon as the best candidate is good enough):
  1. YouTube Music "songs" catalog: official audio, best matches
  2. YouTube Music "videos"
  3. yt-dlp `ytsearch` (plain YouTube search)
"""

import asyncio
import logging
import threading
import time

from ytmusicapi import YTMusic

from ..cache import MatchCache
from ..models import Candidate, Track
from .matcher import HIGH, MEDIUM, rank, search_query

log = logging.getLogger(__name__)


class SearchFailed(Exception):
    pass


class _Breaker:
    """Skip a layer that keeps returning nothing (e.g. the songs catalog from some datacenter IPs)."""

    def __init__(self, threshold: int = 3, cooldown_s: int = 600):
        self.threshold, self.cooldown_s = threshold, cooldown_s
        self.empty_streak, self.open_until = 0, 0.0
        self._lock = threading.Lock()

    @property
    def open(self) -> bool:
        return time.monotonic() < self.open_until

    def record(self, empty: bool) -> None:
        with self._lock:
            self.empty_streak = self.empty_streak + 1 if empty else 0
            if self.empty_streak >= self.threshold:
                self.open_until = time.monotonic() + self.cooldown_s
                self.empty_streak = 0
                log.info("ytmusic songs search returned nothing %d times; skipping it for %ds", self.threshold, self.cooldown_s)


def _ytm_to_candidates(results: list[dict], source: str) -> list[Candidate]:
    out = []
    for r in results:
        if not r.get("videoId") or r.get("resultType") not in ("song", "video"):
            continue
        out.append(
            Candidate(
                video_id=r["videoId"],
                title=r.get("title") or "",
                channel=", ".join(a["name"] for a in r.get("artists") or [] if a.get("name")) or None,
                duration_s=r.get("duration_seconds"),
                source=source,
            )
        )
    return out


class Searcher:
    def __init__(self, cache: MatchCache | None, location: str = "", retries: int = 2):
        self._cache = cache
        self._location = location
        self._retries = retries
        self._local = threading.local()
        self.songs_breaker = _Breaker()

    # ytmusicapi keeps a requests.Session per instance; use one instance per worker thread.
    def _ytm(self) -> YTMusic:
        if not hasattr(self._local, "ytm"):
            self._local.ytm = YTMusic(location=self._location)
        return self._local.ytm

    def _ytm_search(self, query: str, kind: str, limit: int = 5) -> list[Candidate]:
        results = self._ytm().search(query, filter=kind, limit=limit)
        return _ytm_to_candidates(results, "ytmusic_song" if kind == "songs" else "ytmusic_video")[:limit]

    @staticmethod
    def _ytdlp_search(query: str, limit: int = 5) -> list[Candidate]:
        import yt_dlp

        opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
        return [
            Candidate(
                video_id=e["id"],
                title=e.get("title") or "",
                channel=e.get("channel") or e.get("uploader"),
                duration_s=int(e["duration"]) if e.get("duration") else None,
                source="ytdlp",
            )
            for e in (info or {}).get("entries") or []
            if e.get("id")
        ]

    async def _call(self, fn, *args) -> list[Candidate] | None:
        """Run a blocking search in a thread with retry; None means the layer errored."""
        for attempt in range(self._retries + 1):
            try:
                return await asyncio.to_thread(fn, *args)
            except Exception as exc:  # network hiccups, throttling, parser breakage
                log.warning("%s failed (attempt %d): %s", getattr(fn, "__name__", fn), attempt + 1, exc)
                if attempt < self._retries:
                    await asyncio.sleep(1.5 * 2**attempt)
        return None

    async def find(self, track: Track) -> list[Candidate]:
        """Ranked candidates for a track, best first (may be empty)."""
        if self._cache and (cached := self._cache.get(track)) is not None:
            return cached

        query = search_query(track)
        pool: list[Candidate] = []
        failures = 0

        if not self.songs_breaker.open:
            songs = await self._call(self._ytm_search, query, "songs")
            if songs is None:
                failures += 1
            else:
                self.songs_breaker.record(empty=not songs)
                pool += songs
        ranked = rank(track, pool)

        if not ranked or ranked[0].score < HIGH:
            videos = await self._call(self._ytm_search, query, "videos")
            failures += videos is None
            pool += videos or []
            ranked = rank(track, pool)

        if not ranked or ranked[0].score < MEDIUM:
            plain = await self._call(self._ytdlp_search, query)
            failures += plain is None
            pool += plain or []
            ranked = rank(track, pool)

        if not ranked and failures:
            raise SearchFailed("YouTube search is unavailable right now.")
        if self._cache and ranked:
            self._cache.put(track, ranked[:5])
        return ranked

    async def free_text(self, query: str, limit: int = 8) -> list[Candidate]:
        """Manual search from the review screen."""
        results = await self._call(self._ytm_search, query, "videos", limit)
        if not results:
            results = await self._call(self._ytdlp_search, query, limit)
        if results is None:
            raise SearchFailed("YouTube search is unavailable right now.")
        return results
