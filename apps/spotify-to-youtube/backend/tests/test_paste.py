from app.sources.paste import parse_track_text


def test_dash_lines_with_numbers_and_durations():
    pl = parse_track_text("1. a-ha - Take On Me (3:45)\n2) Queen – Bohemian Rhapsody\n\n# comment\nToto - Africa 4:55")
    assert pl.source == "paste" and pl.total == 3
    assert [(t.artists, t.title) for t in pl.tracks] == [
        (["a-ha"], "Take On Me"),
        (["Queen"], "Bohemian Rhapsody"),
        (["Toto"], "Africa"),
    ]
    assert pl.tracks[0].duration_ms == 225_000 and pl.tracks[2].duration_ms == 295_000


def test_by_lines_and_bare_titles():
    pl = parse_track_text("Fast Car by Tracy Chapman\nSmalltown Boy")
    assert pl.tracks[0].artists == ["Tracy Chapman"] and pl.tracks[0].title == "Fast Car"
    assert pl.tracks[1].artists == [] and pl.tracks[1].title == "Smalltown Boy"


def test_multiple_artists():
    pl = parse_track_text("Eurythmics, Annie Lennox & Dave Stewart - Sweet Dreams")
    assert pl.tracks[0].artists == ["Eurythmics", "Annie Lennox", "Dave Stewart"]


def test_exportify_csv():
    csv_text = (
        '"Track URI","Track Name","Artist Name(s)","Album Name","Duration (ms)"\n'
        '"spotify:track:1","Take on Me","a-ha","Hunting High and Low","225280"\n'
        '"spotify:track:2","Sweet Dreams","Eurythmics,Annie Lennox","Sweet Dreams","216933"\n'
    )
    pl = parse_track_text(csv_text)
    assert pl.total == 2
    t = pl.tracks[1]
    assert t.artists == ["Eurythmics", "Annie Lennox"] and t.album == "Sweet Dreams" and t.duration_ms == 216933
    assert pl.tracks[0].spotify_uri == "spotify:track:1"


def test_simple_csv_with_mmss_duration():
    pl = parse_track_text("title,artist,duration\nAfrica,Toto,4:55\n")
    assert pl.tracks[0].title == "Africa" and pl.tracks[0].duration_ms == 295_000
