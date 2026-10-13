"""Record raw YouTube Music / YouTube search responses plus ytmusicapi's parsed results for them.

The TypeScript parsers (src/engine/youtube/innertube.ts) are tested against these. Needs network.
  ../../apps/spotify-to-youtube/backend/.venv/bin/python tests/golden/gen_search_fixtures.py
"""
import json
from pathlib import Path

import requests
from ytmusicapi import YTMusic
from ytmusicapi.parsers.search import get_search_params, parse_search_results

OUT = Path(__file__).resolve().parents[1] / "fixtures"
yt = YTMusic()
for kind, query in (("videos", "a-ha take on me"), ("songs", "a-ha take on me")):
    params = get_search_params(kind, None, False)
    raw = yt._send_request("search", {"query": query, "params": params})
    (OUT / f"ytmusic_search_{kind}.json").write_text(json.dumps(raw))
    # Parse the *recorded* response (a second live call can return results in a different order).
    original = yt._send_request
    yt._send_request = lambda *_a, **_k: raw
    try:
        parsed = yt.search(query, filter=kind, limit=20)
    finally:
        yt._send_request = original
    (OUT / f"ytmusic_search_{kind}.parsed.json").write_text(json.dumps(
        [{k: r.get(k) for k in ("resultType", "videoId", "title", "artists", "duration_seconds")} for r in parsed], ensure_ascii=False, indent=1))
    print(kind, "results:", len(parsed))

body = {"context": {"client": {"clientName": "WEB", "clientVersion": "2.20261013.00.00", "hl": "en"}}, "query": "toto africa"}
r = requests.post("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", json=body,
                  headers={"Origin": "https://www.youtube.com", "Referer": "https://www.youtube.com/"}, timeout=20)
(OUT / "youtube_search.json").write_text(r.text)
print("youtube", r.status_code, len(r.text))
