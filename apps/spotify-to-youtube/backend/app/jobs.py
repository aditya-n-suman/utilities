"""In-memory conversion jobs with an append-only event log (replayable over SSE)."""

import asyncio
import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Literal

import httpx

from .config import settings
from .models import Candidate, Match, Playlist
from .sources import InvalidPlaylistLink, PlaylistUnavailable, SourceChanged, fetch_playlist, parse_track_text
from .youtube.matcher import confidence_for
from .youtube.search import Searcher, SearchFailed

log = logging.getLogger(__name__)

JobStatus = Literal["fetching", "matching", "ready", "failed"]


@dataclass
class Job:
    id: str
    link: str | None = None
    text: str | None = None
    status: JobStatus = "fetching"
    playlist: Playlist | None = None
    matches: list[Match] = field(default_factory=list)
    error: dict | None = None
    created: float = field(default_factory=time.time)
    events: list[dict] = field(default_factory=list)
    changed: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task | None = None

    def emit(self, type_: str, data: dict) -> None:
        self.events.append({"id": len(self.events), "type": type_, "data": data})
        self.changed.set()
        self.changed = asyncio.Event()

    def counts(self) -> dict:
        counts = {"total": len(self.matches), "done": 0, "high": 0, "medium": 0, "low": 0, "not_found": 0, "removed": 0}
        for m in self.matches:
            if m.status != "pending":
                counts["done"] += 1
            if m.status == "removed":
                counts["removed"] += 1
            elif m.status in ("not_found", "error"):
                counts["not_found"] += 1
            elif m.confidence in ("high", "medium", "low"):
                counts[m.confidence] += 1
        return counts

    def video_ids(self) -> list[str]:
        return [m.chosen.video_id for m in self.matches if m.status == "matched" and m.chosen]

    def playlist_public(self) -> dict | None:
        if not self.playlist:
            return None
        return self.playlist.model_dump(exclude={"tracks"}) | {"track_count": len(self.playlist.tracks)}

    def snapshot(self) -> dict:
        return {
            "id": self.id,
            "status": self.status,
            "error": self.error,
            "playlist": self.playlist_public(),
            "matches": [m.public() for m in self.matches],
            "counts": self.counts(),
        }


class JobNotFound(KeyError):
    pass


class JobManager:
    def __init__(self, searcher: Searcher):
        self.searcher = searcher
        self._jobs: dict[str, Job] = {}
        self._search_slots = asyncio.Semaphore(settings.search_concurrency)

    def get(self, job_id: str) -> Job:
        self._expire()
        try:
            return self._jobs[job_id]
        except KeyError:
            raise JobNotFound(job_id) from None

    def create(self, *, link: str | None = None, text: str | None = None) -> Job:
        self._expire()
        job = Job(id=secrets.token_urlsafe(9), link=link, text=text)
        self._jobs[job.id] = job
        job.task = asyncio.create_task(self._run(job))
        return job

    def _expire(self) -> None:
        cutoff = time.time() - settings.job_ttl_seconds
        for job_id in [j.id for j in self._jobs.values() if j.created < cutoff]:
            job = self._jobs.pop(job_id)
            if job.task and not job.task.done():
                job.task.cancel()

    async def _run(self, job: Job) -> None:
        try:
            if job.link:
                job.playlist = await fetch_playlist(job.link)
            else:
                job.playlist = parse_track_text(job.text or "")
        except (InvalidPlaylistLink, PlaylistUnavailable) as exc:
            return self._fail(job, "playlist_unavailable" if isinstance(exc, PlaylistUnavailable) else "invalid_link", str(exc))
        except SourceChanged as exc:
            log.exception("Spotify source changed")
            return self._fail(job, "spotify_changed", f"Couldn't read this playlist from Spotify ({exc}).")
        except httpx.HTTPError as exc:
            return self._fail(job, "spotify_unreachable", f"Couldn't reach Spotify ({exc.__class__.__name__}).")
        except Exception as exc:  # pragma: no cover - defensive
            log.exception("playlist fetch failed")
            return self._fail(job, "internal", str(exc))

        if not job.playlist.tracks:
            return self._fail(job, "empty", "No tracks found.")
        job.matches = [Match(index=i, track=t) for i, t in enumerate(job.playlist.tracks)]
        job.status = "matching"
        job.emit("playlist", {"playlist": job.playlist_public(), "matches": [m.public() for m in job.matches]})

        await asyncio.gather(*(self._match_one(job, m) for m in job.matches))
        job.status = "ready"
        job.emit("done", {"counts": job.counts()})

    def _fail(self, job: Job, code: str, message: str) -> None:
        job.status = "failed"
        job.error = {"code": code, "message": message}
        job.emit("failed", job.error)

    async def _match_one(self, job: Job, match: Match) -> None:
        async with self._search_slots:
            try:
                ranked = await self.searcher.find(match.track)
            except SearchFailed as exc:
                match.status, match.error = "error", str(exc)
                ranked = None
        if ranked is not None:
            self._apply_ranking(match, ranked)
        job.emit("match", {"match": match.public(), "counts": job.counts()})

    @staticmethod
    def _apply_ranking(match: Match, ranked: list[Candidate]) -> None:
        match.alternatives = ranked[:4]
        best = ranked[0] if ranked else None
        match.confidence = confidence_for(best.score) if best else "none"
        if best and match.confidence != "none":
            match.status, match.chosen = "matched", best
        else:
            match.status, match.chosen = "not_found", None

    async def retry(self, job: Job, index: int) -> Match:
        match = job.matches[index]
        match.status, match.error = "pending", None
        await self._match_one(job, match)
        return match

    def edit(self, job: Job, index: int, action: str, candidate: Candidate | None = None) -> Match:
        match = job.matches[index]
        if action == "remove":
            match.status = "removed"
        elif action == "restore":
            match.status = "matched" if match.chosen else "not_found"
        elif action == "choose" and candidate:
            known = next((c for c in match.alternatives if c.video_id == candidate.video_id), None)
            match.chosen = known or candidate
            if not known:
                match.alternatives = [candidate, *match.alternatives][:5]
            match.status, match.confidence = "matched", "high"  # a human picked it
        else:
            raise ValueError("Unknown action.")
        job.emit("match", {"match": match.public(), "counts": job.counts()})
        return match
