import json

import pytest
from fastapi.testclient import TestClient

from app import jobs as jobs_module
from app import main
from app.models import Candidate, Playlist, Track


def fake_find_factory():
    async def find(self, track):
        if track.title == "Unknown Song":
            return []
        return [Candidate(video_id=f"v_{track.title[:3]}", title=track.title, channel=track.artist_line,
                          duration_s=(track.duration_ms or 0) // 1000 or None, source="ytmusic_song", score=0.95)]
    return find


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(main.settings.__class__, "cache_path", property(lambda self: tmp_path / "c.sqlite3"), raising=False)
    monkeypatch.setattr(jobs_module.Searcher, "find", fake_find_factory())

    async def fake_fetch(link, **_):
        return Playlist(id="x", name="Test’s List", owner="me", total=2, source="embed",
                        tracks=[Track(title="Take On Me", artists=["a-ha"], duration_ms=225_000),
                                Track(title="Unknown Song", artists=["Nobody"])])

    monkeypatch.setattr(jobs_module, "fetch_playlist", fake_fetch)
    with TestClient(main.app) as c:
        yield c


def wait_ready(client, job_id):
    for _ in range(200):
        snap = client.get(f"/api/jobs/{job_id}").json()
        if snap["status"] in ("ready", "failed"):
            return snap
    raise AssertionError("job did not finish")


def test_rejects_bad_input(client):
    assert client.post("/api/convert", json={}).status_code == 422
    r = client.post("/api/convert", json={"url": "https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX"})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "invalid_link"


def test_full_flow_from_link(client):
    job_id = client.post("/api/convert", json={"url": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"}).json()["job_id"]
    snap = wait_ready(client, job_id)
    assert snap["status"] == "ready" and snap["playlist"]["name"] == "Test’s List"
    assert [m["status"] for m in snap["matches"]] == ["matched", "not_found"]
    assert snap["counts"]["high"] == 1 and snap["counts"]["not_found"] == 1
    assert snap["matches"][0]["chosen"]["thumbnail"].startswith("https://i.ytimg.com/")

    links = client.post(f"/api/jobs/{job_id}/links").json()
    assert links["video_count"] == 1 and links["links"][0]["url"].endswith("video_ids=v_Tak")

    # Manually choose a video for the unmatched track, then remove the first one.
    pick = {"video_id": "manual1", "title": "Unknown Song", "channel": "Nobody", "duration_s": 200, "source": "ytdlp"}
    r = client.patch(f"/api/jobs/{job_id}/matches/1", json={"action": "choose", "candidate": pick})
    assert r.json()["match"]["status"] == "matched"
    client.patch(f"/api/jobs/{job_id}/matches/0", json={"action": "remove"})
    links = client.post(f"/api/jobs/{job_id}/links").json()
    assert links["links"][0]["url"].endswith("video_ids=manual1")

    report = client.get(f"/api/jobs/{job_id}/report.csv")
    assert report.status_code == 200 and "Test%E2%80%99s" in report.headers["content-disposition"]
    csv_text = report.text
    assert "Unknown Song" in csv_text and "removed" in csv_text


def test_event_stream_replays_history(client):
    job_id = client.post("/api/convert", json={"text": "a-ha - Take On Me"}).json()["job_id"]
    wait_ready(client, job_id)
    job = main.app.state.jobs.get(job_id)
    assert [e["type"] for e in job.events] == ["playlist", "match", "done"]
    assert json.loads(json.dumps(job.events[0]["data"]))["playlist"]["source"] == "paste"


def test_save_requires_sign_in(client):
    job_id = client.post("/api/convert", json={"text": "a-ha - Take On Me"}).json()["job_id"]
    wait_ready(client, job_id)
    assert client.post(f"/api/jobs/{job_id}/save", json={}).status_code == 401
    assert client.post("/api/auth/youtube/start").status_code in (501, 200)


def test_unknown_job_404(client):
    assert client.get("/api/jobs/nope").status_code == 404
