import asyncio
import csv
import io
import json
import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import quote

from fastapi import Cookie, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, model_validator
from sse_starlette.sse import EventSourceResponse

from .cache import MatchCache
from .config import settings
from .jobs import Job, JobManager, JobNotFound
from .models import Candidate
from .sources import InvalidPlaylistLink, parse_playlist_id
from .youtube import auth
from .youtube.playlist import SaveFailed, playlist_urls, save_playlist, temp_links
from .youtube.search import Searcher, SearchFailed

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")

SESSION_COOKIE = "s2y_sid"
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.jobs = JobManager(Searcher(MatchCache(settings.cache_path, settings.cache_ttl_days), settings.ytmusic_location))
    app.state.auth = auth.AuthStore(settings.job_ttl_seconds)
    yield


app = FastAPI(title="Spotify → YouTube playlist converter", lifespan=lifespan)


def _jobs(request: Request) -> JobManager:
    return request.app.state.jobs


def _job(request: Request, job_id: str) -> Job:
    try:
        return _jobs(request).get(job_id)
    except JobNotFound:
        raise HTTPException(404, "Conversion not found or expired.") from None


def _session(response: Response, sid: str | None) -> str:
    if not sid:
        sid = secrets.token_urlsafe(24)
        response.set_cookie(SESSION_COOKIE, sid, httponly=True, samesite="lax", max_age=settings.job_ttl_seconds)
    return sid


# ---- conversion -----------------------------------------------------------------------------


class ConvertRequest(BaseModel):
    url: str | None = None
    text: str | None = None
    name: str | None = None  # display name for pasted lists (e.g. the CSV filename)

    @model_validator(mode="after")
    def one_input(self):
        if bool(self.url and self.url.strip()) == bool(self.text and self.text.strip()):
            raise ValueError("Provide either a Spotify playlist link or a track list.")
        return self


@app.get("/api/health")
async def health():
    return {"ok": True, "save_enabled": settings.save_enabled, "max_tracks": settings.max_tracks}


@app.post("/api/convert", status_code=202)
async def convert(body: ConvertRequest, request: Request):
    if body.url:
        try:
            parse_playlist_id(body.url)
        except InvalidPlaylistLink as exc:
            raise HTTPException(400, {"code": "invalid_link", "message": str(exc)}) from None
    job = _jobs(request).create(link=body.url and body.url.strip(), text=body.text, name=body.name)
    return {"job_id": job.id}


@app.get("/api/jobs/{job_id}")
async def job_snapshot(job_id: str, request: Request):
    return _job(request, job_id).snapshot()


@app.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str, request: Request):
    """SSE stream. Events: playlist, match, done, failed. Supports Last-Event-ID resume."""
    job = _job(request, job_id)
    last = request.headers.get("last-event-id")
    start = int(last) + 1 if last and last.isdigit() else 0

    async def stream():
        cursor = start
        while True:
            # Grab the waiter before draining so an event emitted mid-drain isn't missed.
            # The stream stays open after "done" so review edits from other tabs show up too.
            waiter = job.changed
            while cursor < len(job.events):
                event = job.events[cursor]
                yield {"id": str(event["id"]), "event": event["type"], "data": json.dumps(event["data"])}
                cursor += 1
            if await request.is_disconnected():
                return
            try:
                await asyncio.wait_for(waiter.wait(), timeout=15)
            except TimeoutError:
                continue

    return EventSourceResponse(stream(), ping=15)


class EditRequest(BaseModel):
    action: Literal["choose", "remove", "restore", "retry"]
    candidate: Candidate | None = None


@app.patch("/api/jobs/{job_id}/matches/{index}")
async def edit_match(job_id: str, index: int, body: EditRequest, request: Request):
    job = _job(request, job_id)
    if not 0 <= index < len(job.matches):
        raise HTTPException(404, "No such track.")
    if body.action == "retry":
        match = await _jobs(request).retry(job, index)
    else:
        try:
            match = _jobs(request).edit(job, index, body.action, body.candidate)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None
    return {"match": match.public(), "counts": job.counts()}


@app.get("/api/jobs/{job_id}/matches/{index}/search")
async def match_search(job_id: str, index: int, q: str, request: Request):
    job = _job(request, job_id)
    if not 0 <= index < len(job.matches):
        raise HTTPException(404, "No such track.")
    if not q.strip():
        raise HTTPException(400, "Empty query.")
    try:
        results = await _jobs(request).search_for(job, index, q.strip()[:200])
    except SearchFailed as exc:
        raise HTTPException(503, {"code": "search_unavailable", "message": str(exc)}) from None
    return {"results": [c.public() for c in results]}


@app.post("/api/jobs/{job_id}/retry-errors")
async def retry_errors(job_id: str, request: Request):
    job = _job(request, job_id)
    return {"queued": _jobs(request).retry_errors(job), "counts": job.counts()}


@app.get("/api/search")
async def manual_search(q: str, request: Request):
    if not q.strip():
        raise HTTPException(400, "Empty query.")
    try:
        results = await _jobs(request).searcher.free_text(q.strip()[:200])
    except SearchFailed as exc:
        raise HTTPException(503, {"code": "search_unavailable", "message": str(exc)}) from None
    return {"results": [c.public() for c in results]}


@app.post("/api/jobs/{job_id}/links")
async def temporary_links(job_id: str, request: Request):
    job = _job(request, job_id)
    ids = job.video_ids()
    if not ids:
        raise HTTPException(409, "No matched tracks yet.")
    links = temp_links(ids, settings.temp_link_chunk)
    return {"links": [{"part": i + 1, "of": len(links), "url": u} for i, u in enumerate(links)], "video_count": len(ids)}


@app.get("/api/jobs/{job_id}/report.csv")
async def report(job_id: str, request: Request):
    job = _job(request, job_id)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["#", "Title", "Artists", "Album", "Duration (s)", "Status", "Confidence", "YouTube title", "Channel", "YouTube URL", "Score"])
    for m in job.matches:
        c = m.chosen if m.status == "matched" else None
        writer.writerow([
            m.index + 1, m.track.title, m.track.artist_line, m.track.album or "",
            round(m.track.duration_ms / 1000) if m.track.duration_ms else "", m.status, m.confidence or "",
            c.title if c else "", (c.channel or "") if c else "", c.url if c else "", c.score if c else "",
        ])
    filename = f"{job.playlist.name if job.playlist else 'playlist'} - YouTube matches.csv"
    ascii_name = filename.encode("ascii", "ignore").decode().replace('"', "") or "matches.csv"
    return Response(
        buf.getvalue(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"},
    )


# ---- save to the user's YouTube account (device-code sign-in) ------------------------------


@app.post("/api/auth/youtube/start")
async def auth_start(request: Request, response: Response, s2y_sid: str | None = Cookie(None)):
    sid = _session(response, s2y_sid)
    try:
        flow = await asyncio.to_thread(auth.start_flow)
    except auth.AuthNotConfigured as exc:
        raise HTTPException(501, {"code": "save_disabled", "message": str(exc)}) from None
    except Exception as exc:  # bad client id/secret, Google unreachable, …
        log.warning("Google sign-in could not start: %s", exc)
        raise HTTPException(502, {"code": "save_failed", "message": "Google sign-in isn't available right now."}) from None
    request.app.state.auth.get(sid).flow = flow
    return {"user_code": flow.user_code, "verification_url": flow.verification_url, "interval": flow.interval, "expires_at": flow.expires_at}


@app.post("/api/auth/youtube/poll")
async def auth_poll(request: Request, s2y_sid: str | None = Cookie(None)):
    if not s2y_sid:
        raise HTTPException(401, "No sign-in in progress.")
    state = request.app.state.auth.get(s2y_sid)
    if state.token:
        return {"status": "authorized"}
    if not state.flow:
        raise HTTPException(409, "No sign-in in progress.")
    try:
        status, token = await asyncio.to_thread(auth.poll_flow, state.flow)
    except Exception as exc:
        log.warning("Google sign-in poll failed: %s", exc)
        raise HTTPException(502, {"code": "save_failed", "message": "Google sign-in failed."}) from None
    if token:
        state.token, state.flow = token, None
    return {"status": status}


@app.get("/api/auth/youtube")
async def auth_status(request: Request, s2y_sid: str | None = Cookie(None)):
    signed_in = bool(s2y_sid and request.app.state.auth.get(s2y_sid).token)
    return {"enabled": settings.save_enabled, "signed_in": signed_in}


@app.delete("/api/auth/youtube")
async def auth_logout(request: Request, s2y_sid: str | None = Cookie(None)):
    if s2y_sid:
        request.app.state.auth.clear(s2y_sid)
    return {"signed_in": False}


class SaveRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    privacy: Literal["private", "unlisted", "public"] = "private"


@app.post("/api/jobs/{job_id}/save")
async def save(job_id: str, body: SaveRequest, request: Request, s2y_sid: str | None = Cookie(None)):
    job = _job(request, job_id)
    state = request.app.state.auth.get(s2y_sid) if s2y_sid else None
    if not state or not state.token:
        raise HTTPException(401, {"code": "not_signed_in", "message": "Sign in to YouTube first."})
    ids = job.video_ids()
    if not ids:
        raise HTTPException(409, "No matched tracks to save.")
    title = body.title or (job.playlist.name if job.playlist else "Converted playlist")
    description = body.description if body.description is not None else "Converted from Spotify."
    try:
        playlist_id = await asyncio.to_thread(
            save_playlist, state.token, auth.credentials(), title=title, description=description,
            privacy=body.privacy, video_ids=ids,
        )
    except SaveFailed as exc:
        raise HTTPException(502, {"code": "save_failed", "message": str(exc)}) from None
    except Exception as exc:  # expired/revoked token, YouTube errors
        log.warning("Saving playlist failed: %s", exc)
        raise HTTPException(502, {"code": "save_failed", "message": "YouTube didn't accept the playlist."}) from None
    return {"playlist_id": playlist_id, "urls": playlist_urls(playlist_id), "video_count": len(ids)}


# ---- built frontend (production) ------------------------------------------------------------

if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        file = FRONTEND_DIST / path
        if path and file.is_file() and FRONTEND_DIST in file.resolve().parents:
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")
