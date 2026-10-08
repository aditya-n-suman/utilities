"""Live end-to-end check without the web UI.

    python -m scripts.smoke "https://open.spotify.com/playlist/<id>" [--limit 20]
    python -m scripts.smoke --text "a-ha - Take On Me"
"""

import argparse
import asyncio
import sys
import time

from app.cache import MatchCache
from app.config import settings
from app.sources import fetch_playlist, parse_track_text
from app.youtube.matcher import confidence_for
from app.youtube.playlist import temp_links
from app.youtube.search import Searcher


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url", nargs="?")
    parser.add_argument("--text")
    parser.add_argument("--limit", type=int, default=20, help="tracks to match (0 = all)")
    parser.add_argument("--no-cache", action="store_true")
    args = parser.parse_args()

    started = time.monotonic()
    playlist = await fetch_playlist(args.url) if args.url else parse_track_text(args.text.replace("\\n", "\n"))
    print(f"{playlist.name!r} by {playlist.owner} — {len(playlist.tracks)}/{playlist.total} tracks via {playlist.source} "
          f"({time.monotonic() - started:.1f}s)")

    tracks = playlist.tracks if args.limit == 0 else playlist.tracks[: args.limit]
    searcher = Searcher(None if args.no_cache else MatchCache(settings.cache_path, settings.cache_ttl_days), settings.ytmusic_location)
    slots = asyncio.Semaphore(settings.search_concurrency)

    async def one(track):
        async with slots:
            return track, await searcher.find(track)

    started = time.monotonic()
    ids, tally = [], {"high": 0, "medium": 0, "low": 0, "none": 0}
    for track, ranked in await asyncio.gather(*(one(t) for t in tracks)):
        best = ranked[0] if ranked else None
        conf = confidence_for(best.score) if best else "none"
        tally[conf] += 1
        if best and conf != "none":
            ids.append(best.video_id)
        shown = f"{best.title} [{best.channel}] {best.score:.2f} {best.source}" if best else "—"
        print(f"  {conf:>6} | {track.artist_line} - {track.title}  →  {shown}")
    print(f"matched {len(ids)}/{len(tracks)} {tally} in {time.monotonic() - started:.1f}s")
    for link in temp_links(ids, settings.temp_link_chunk):
        print(link)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
