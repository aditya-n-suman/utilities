"""Generate golden expectations for the TypeScript matcher from the Python one.

Reads apps/spotify-to-youtube (never modifies it). Two steps:
  1. --collect: search YouTube for real candidates and save them to candidates.json (network; run rarely)
  2. default:   score candidates.json + edge cases with the Python matcher -> golden.json (offline)

Run with the web app's venv:
  ../../apps/spotify-to-youtube/backend/.venv/bin/python tests/golden/gen_golden.py [--collect]
"""
import asyncio
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[3] / "apps" / "spotify-to-youtube" / "backend"
sys.path.insert(0, str(BACKEND))

from rapidfuzz import fuzz  # noqa: E402

from app.models import Candidate, Track  # noqa: E402
from app.youtube import matcher  # noqa: E402

CANDIDATES = HERE / "candidates.json"
GOLDEN = HERE / "golden.json"

PLAYLISTS = [
    ("https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe", 30),  # All Out 80s
    ("https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM", 20),  # Hot Hits Hindi
]
EXTRA_TRACKS = [
    Track(title="Bohemian Rhapsody - Remastered 2011", artists=["Queen"], duration_ms=354_000),
    Track(title="Bohemian Rhapsody - Live Aid", artists=["Queen"], duration_ms=165_000),
    Track(title="Despacito (feat. Daddy Yankee)", artists=["Luis Fonsi", "Daddy Yankee"], duration_ms=229_000),
    Track(title="Beyoncé", artists=["Rosalía"], duration_ms=None),
    Track(title="Smalltown Boy", artists=[], duration_ms=None),
    Track(title="Tum Hi Ho", artists=["Arijit Singh", "Mithoon"], duration_ms=262_000),
    Track(title="तुम ही हो", artists=["अरिजीत सिंह"], duration_ms=262_000),
    Track(title="Africa", artists=["TOTO"], duration_ms=295_000),
]


async def collect() -> None:
    from app.sources import fetch_playlist
    from app.youtube.search import Searcher

    tracks = list(EXTRA_TRACKS)
    for url, limit in PLAYLISTS:
        tracks += (await fetch_playlist(url)).tracks[:limit]
    searcher = Searcher(None, retries=1)
    cases = []
    for t in tracks:
        query = matcher.search_query(t)
        pool: list[Candidate] = []
        for fn, args in ((searcher._ytm_search, (query, "videos")), (searcher._ytdlp_search, (query,))):
            try:
                pool += await asyncio.to_thread(fn, *args)
            except Exception as exc:  # noqa: BLE001 - best effort collection
                print("search failed:", exc)
        cases.append({"track": t.model_dump(), "candidates": [c.model_dump() for c in pool]})
        print(f"{len(pool):2d} candidates for {query}")
    CANDIDATES.write_text(json.dumps(cases, ensure_ascii=False, indent=1))


STRING_PAIRS = [
    ("", ""), ("", "abc"), ("abc", ""), ("a", "a"), ("abc", "abd"), ("this is a test", "this is a test!"),
    ("queen", "queen official queen bohemian rhapsody official video remastered"),
    ("bohemian rhapsody", "rhapsody bohemian"), ("take on me", "take on me 2017 acoustic"),
    ("beyonce", "beyoncé"), ("rosalia", "rosalía beyoncé official video"),
    ("तुम ही हो", "तुम ही हो अरिजीत सिंह"), ("arijit singh", "tum hi ho aashiqui 2 arijit singh"),
    ("a b c d", "d c b a"), ("new york new york", "new york"), ("abcd", "bcda"), ("xyz", "abc"),
    ("emoji 🎵 song", "emoji song 🎵"), ("ab", "ba"), ("same length", "length same"),
]
NORMALIZE_INPUTS = [
    "Beyoncé", "Rosalía & Ozuna", "Tum Hi Ho (From \"Aashiqui 2\")", "तुम ही हो", "अरिजीत सिंह",
    "Ñandú – ¡Olé!", "AC/DC", "Guns N' Roses", "Sigur Rós", "ﬁ ligature ①", "Crème brûlée",
    "Ça va?", "Mötley Crüe", "Tiësto", "ஜிங்கிள்", "Ελληνικά", "Ångström", "日本語の歌", "🎵 Song 🎶",
]
CLEAN_INPUTS = [
    "Eyes Without A Face - Remastered 1999", "Material Girl - 2024 Remaster",
    'Holding Out for a Hero - From "Footloose" Soundtrack', "Smooth Operator - Single Version",
    "Stay (feat. Justin Bieber)", "Hey Jude - Remastered 2015 - Mono", "Sweet Dreams (Are Made of This)",
    "Bohemian Rhapsody - Live Aid", 'Tum Ho Toh (From "Saiyaara")',
    'Deewaniyat (From "Ek Deewane Ki Deewaniyat") - Original Motion Picture Soundtrack',
    "Song [ft. Someone] - Radio Edit", "Track - 25th Anniversary Edition", "Plain Title",
]


def golden() -> None:
    cases = json.loads(CANDIDATES.read_text())
    out = {"string_pairs": [], "normalize": [], "clean_title": [], "cases": []}
    for a, b in STRING_PAIRS:
        out["string_pairs"].append({
            "a": a, "b": b,
            "ratio": fuzz.ratio(a, b), "partial_ratio": fuzz.partial_ratio(a, b),
            "token_sort_ratio": fuzz.token_sort_ratio(a, b), "token_set_ratio": fuzz.token_set_ratio(a, b),
        })
    out["normalize"] = [{"in": s, "out": matcher.normalize(s)} for s in NORMALIZE_INPUTS]
    out["clean_title"] = [{"in": s, "out": matcher.clean_title(s)} for s in CLEAN_INPUTS]
    for case in cases:
        track = Track.model_validate(case["track"])
        cands = [Candidate.model_validate(c) for c in case["candidates"]]
        # every string comparison the matcher makes, so a mismatch points at the exact function
        pairs = []
        for c in cands:
            hay = matcher.normalize(f"{matcher._channel_clean(c.channel)} {c.title}")
            for a in track.artists:
                na = matcher.normalize(a)
                pairs.append({"a": na, "b": hay, "partial_ratio": fuzz.partial_ratio(na, hay)})
        out["cases"].append({
            "track": case["track"],
            "candidates": case["candidates"],
            "search_query": matcher.search_query(track),
            "raw_scores": [matcher.raw_score(track, c) for c in cands],
            "scores": [matcher.score(track, c) for c in cands],
            "rank": [c.video_id for c in matcher.rank(track, cands)],
            "artist_pairs": pairs[:20],
        })
    GOLDEN.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    n = sum(len(c["candidates"]) for c in out["cases"])
    print(f"golden.json: {len(out['cases'])} tracks, {n} candidates, {len(STRING_PAIRS)} string pairs")


if __name__ == "__main__":
    if "--collect" in sys.argv:
        asyncio.run(collect())
    golden()
