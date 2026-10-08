import pytest

from app.models import Candidate, Track
from app.youtube.matcher import clean_title, confidence_for, rank, score, search_query
from app.youtube.playlist import temp_links


@pytest.mark.parametrize(
    "raw,clean",
    [
        ("Eyes Without A Face - Remastered 1999", "Eyes Without A Face"),
        ("Material Girl - 2024 Remaster", "Material Girl"),
        ('Holding Out for a Hero - From "Footloose" Soundtrack', "Holding Out for a Hero"),
        ("Smooth Operator - Single Version", "Smooth Operator"),
        ("Stay (feat. Justin Bieber)", "Stay"),
        ('Tum Ho Toh (From "Saiyaara")', "Tum Ho Toh"),
        ('Deewaniyat (From "Ek Deewane Ki Deewaniyat") - Original Motion Picture Soundtrack', "Deewaniyat"),
        ("Hey Jude - Remastered 2015 - Mono", "Hey Jude"),
        ("Sweet Dreams (Are Made of This)", "Sweet Dreams (Are Made of This)"),
        ("Bohemian Rhapsody - Live Aid", "Bohemian Rhapsody - Live Aid"),
    ],
)
def test_clean_title(raw, clean):
    assert clean_title(raw) == clean


def test_search_query_uses_first_two_artists():
    t = Track(title="Sweet Dreams - 2005 Remaster", artists=["Eurythmics", "Annie Lennox", "Dave Stewart"])
    assert search_query(t) == "Eurythmics Annie Lennox Sweet Dreams"


def cand(vid, title, channel, dur, source="ytmusic_video"):
    return Candidate(video_id=vid, title=title, channel=channel, duration_s=dur, source=source)


TRACK = Track(title="Bohemian Rhapsody - Remastered 2011", artists=["Queen"], duration_ms=354_000)


def test_prefers_official_over_live_cover_and_lyrics():
    ranked = rank(
        TRACK,
        [
            cand("live", "Queen - Bohemian Rhapsody (Live Aid 1985)", "Queen Official", 165),
            cand("cover", "Bohemian Rhapsody (Cover)", "Some Choir", 352),
            cand("lyrics", "Queen - Bohemian Rhapsody (Lyrics)", "7clouds Rock", 355),
            cand("official", "Queen – Bohemian Rhapsody (Official Video Remastered)", "Queen Official", 360),
            cand("topic", "Bohemian Rhapsody", "Queen - Topic", 355, "ytmusic_song"),
        ],
    )
    assert ranked[0].video_id == "topic"
    order = [c.video_id for c in ranked]
    assert order.index("official") < order.index("lyrics") < order.index("cover")
    assert order.index("lyrics") < order.index("live")
    assert confidence_for(ranked[0].score) == "high"


def test_live_is_fine_when_source_is_live():
    live_track = Track(title="Bohemian Rhapsody - Live Aid", artists=["Queen"], duration_ms=165_000)
    ranked = rank(live_track, [
        cand("studio", "Bohemian Rhapsody", "Queen - Topic", 355, "ytmusic_song"),
        cand("live", "Queen - Bohemian Rhapsody (Live Aid 1985)", "Queen Official", 165),
    ])
    assert ranked[0].video_id == "live"


def test_wrong_song_scores_low():
    s = score(TRACK, cand("x", "Never Gonna Give You Up", "Rick Astley", 213))
    assert confidence_for(s) == "none"


def test_duration_breaks_ties():
    ranked = rank(TRACK, [cand("long", "Bohemian Rhapsody", "Queen", 600), cand("ok", "Bohemian Rhapsody", "Queen", 356)])
    assert ranked[0].video_id == "ok"


def test_rank_dedupes():
    ranked = rank(TRACK, [cand("a", "Bohemian Rhapsody", "Queen", 355)] * 3)
    assert len(ranked) == 1


def test_temp_links_chunking():
    ids = [f"id{i:02d}" for i in range(120)]
    links = temp_links(ids, chunk=50)
    assert len(links) == 3
    assert links[0].startswith("https://www.youtube.com/watch_videos?video_ids=id00,id01")
    assert links[2].endswith("id119") and links[2].count(",") == 19


def test_right_title_wrong_artist_is_not_high():
    t = Track(title="Take On Me", artists=["a-ha"], duration_ms=225_000)
    assert confidence_for(score(t, cand("x", "Take On Me", "Sing King", 230))) != "high"
    assert confidence_for(score(t, cand("y", "Take On Me (Karaoke)", "Sing King", 230))) in ("low", "none")
