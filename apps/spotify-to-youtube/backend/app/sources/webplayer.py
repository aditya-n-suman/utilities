"""Tier 3 (fallback): drive the real web player in headless Chromium.

Used only when tier 2 breaks (e.g. Spotify rotated the persisted-query hash). The browser makes
its own `fetchPlaylist` call; we capture its headers/body, then replay it with our own paging.
The discovered hash is remembered so later tier-2 calls work again without a browser.
"""

import asyncio
import json

from ..config import settings
from ..models import Track
from .pathfinder import PAGE_SIZE, parse_page

_discovered_hash: str | None = None
_browser_lock = asyncio.Semaphore(1)


def current_query_hash() -> str:
    return _discovered_hash or settings.spotify_fetch_playlist_hash


async def fetch_with_browser(playlist_id: str, *, max_tracks: int | None = None) -> tuple[list[Track], int, dict]:
    """Returns (tracks, total_count, playlist_v2 metadata of first page)."""
    global _discovered_hash
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("Playwright is not installed; browser fallback unavailable.") from exc

    async with _browser_lock, async_playwright() as p:
        launch_kwargs: dict = {"args": ["--no-sandbox"]}
        if settings.chromium_executable:
            launch_kwargs["executable_path"] = settings.chromium_executable
        browser = await p.chromium.launch(**launch_kwargs)
        try:
            context = await browser.new_context(locale="en-US")
            page = await context.new_page()
            captured: asyncio.Future = asyncio.get_running_loop().create_future()

            def on_request(req):
                if "pathfinder" in req.url and '"fetchPlaylist"' in (req.post_data or "") and not captured.done():
                    captured.set_result((req.url, req.headers, json.loads(req.post_data)))

            page.on("request", on_request)
            await page.goto(f"https://open.spotify.com/playlist/{playlist_id}", wait_until="domcontentloaded")
            url, headers, body = await asyncio.wait_for(captured, timeout=30)
            _discovered_hash = body["extensions"]["persistedQuery"]["sha256Hash"]
            headers = {k: v for k, v in headers.items() if not k.startswith(":")}

            tracks: list[Track] = []
            meta: dict = {}
            offset, total = 0, None
            while total is None or offset < total:
                if max_tracks is not None and len(tracks) >= max_tracks:
                    break
                body["variables"].update(offset=offset, limit=PAGE_SIZE)
                resp = await context.request.post(url, headers=headers, data=json.dumps(body))
                page_tracks, total, playlist_v2 = parse_page(await resp.json())
                meta = meta or playlist_v2
                tracks.extend(page_tracks)
                offset += PAGE_SIZE
            return tracks, total or 0, meta
        finally:
            await browser.close()
