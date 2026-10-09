import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api, ApiError, type Candidate, type Counts, type Match, type PlaylistInfo, type TempLinks } from "./api";
import { ErrorScreen } from "./components/ErrorScreen";
import { Header } from "./components/Header";
import { Landing } from "./components/Landing";
import { MatchList } from "./components/MatchList";
import { Fetching, PlaylistCard } from "./components/PlaylistCard";
import { Result } from "./components/Result";
import type { PanelState, RowHandlers } from "./components/TrackRow";
import { INVALID_LINK, type ErrorAction } from "./copy";
import { initialJob, isSettled, jobReducer, type Filter } from "./state";

type Theme = "light" | "dark";
type ConvertInput = { url: string } | { text: string; name: string };

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("pb-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [job, dispatch] = useReducer(jobReducer, initialJob);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [links, setLinks] = useState<TempLinks | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [saveEnabled, setSaveEnabled] = useState(false);
  const [live, setLive] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const jobIdRef = useRef<string | null>(null);
  const lastInput = useRef<ConvertInput | null>(null);
  jobIdRef.current = job.jobId;

  const announce = useCallback((msg: string) => setLive((prev) => (prev === msg ? `${msg}​` : msg)), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("pb-theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  useEffect(() => {
    api.health().then((h) => setSaveEnabled(h.save_enabled)).catch(() => setSaveEnabled(false));
  }, []);

  // Live job updates over SSE.
  useEffect(() => {
    if (!job.jobId) return;
    const es = api.events(job.jobId);
    const on = (type: string, fn: (data: any) => void) =>
      es.addEventListener(type, (e) => fn(JSON.parse((e as MessageEvent).data)));
    on("fetching", (d) => dispatch({ type: "fetching", playlist: d.playlist as PlaylistInfo, loadingMore: d.loading_more }));
    on("playlist", (d) => {
      dispatch({ type: "playlist", playlist: d.playlist, matches: d.matches as Match[] });
      announce(`Found ${d.matches.length} tracks. Searching YouTube…`);
    });
    on("match", (d) => dispatch({ type: "match", match: d.match, counts: d.counts as Counts }));
    on("done", (d) => {
      dispatch({ type: "done", counts: d.counts });
      announce(`All ${d.counts.total} tracks searched`);
    });
    on("failed", (d) => {
      dispatch({ type: "failed", code: d.code });
      es.close();
    });
    // The browser reconnects on its own after network blips; CLOSED means the job is gone (e.g. expired).
    es.onerror = () => es.readyState === EventSource.CLOSED && dispatch({ type: "failed", code: "job_lost" });
    return () => es.close();
  }, [job.jobId, announce]);

  const resetView = () => {
    setFilter("all");
    setPanel(null);
    setLinks(null);
    setCreateError("");
  };

  const start = useCallback(
    async (input: ConvertInput) => {
      lastInput.current = input;
      setBusy(true);
      try {
        const { job_id } = await api.convert(input);
        resetView();
        dispatch({ type: "started", jobId: job_id });
        announce("Loading playlist");
      } catch (e) {
        if (e instanceof ApiError && e.code === "invalid_link") setUrlError(INVALID_LINK);
        else if ("url" in input) setUrlError("Couldn’t reach the server. Check your connection and try again.");
        else dispatch({ type: "failed", code: "spotify_unreachable" });
      } finally {
        setBusy(false);
      }
    },
    [announce],
  );

  const goHome = useCallback(() => {
    resetView();
    setUrlError("");
    setShowPaste(false);
    dispatch({ type: "reset" });
  }, []);

  const onErrorAction = (action: ErrorAction) => {
    if (action === "retry" && lastInput.current) return start(lastInput.current);
    goHome();
    if (action === "paste") setShowPaste(true);
  };

  // Escape closes an open row panel (the sign-in dialog handles its own Escape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (panel?.mode === "search") searchRef.current?.focus();
  }, [panel?.index, panel?.mode]);

  const applyEdit = useCallback(async (index: number, body: Parameters<typeof api.edit>[2], message: string) => {
    const id = jobIdRef.current;
    if (!id) return;
    try {
      const { match, counts } = await api.edit(id, index, body);
      dispatch({ type: "match", match, counts });
      announce(message);
    } catch (e) {
      announce(e instanceof Error ? e.message : "Something went wrong");
    }
  }, [announce]);

  const handlers: RowHandlers = useMemo(
    () => ({
      togglePanel: (m, mode) =>
        setPanel((p) =>
          p?.index === m.index && p.mode === mode
            ? null
            : {
                index: m.index, mode, results: null, searching: false, error: "", previewId: null,
                query: `${m.track.artists[0] ?? ""} ${m.track.title}`.trim(),
              },
        ),
      setQuery: (q) => setPanel((p) => (p ? { ...p, query: q } : p)),
      search: async (index, q) => {
        const id = jobIdRef.current;
        if (!id) return;
        setPanel((p) => (p && p.index === index ? { ...p, searching: true, error: "", previewId: null } : p));
        try {
          const { results } = await api.search(id, index, q);
          setPanel((p) => (p && p.index === index ? { ...p, searching: false, results } : p));
          announce(`${results.length} results`);
        } catch (e) {
          const msg = e instanceof ApiError && e.code === "search_unavailable" ? "YouTube search isn’t responding. Try again in a moment." : "Search failed. Try again.";
          setPanel((p) => (p && p.index === index ? { ...p, searching: false, error: msg } : p));
        }
      },
      preview: (videoId) => setPanel((p) => (p ? { ...p, previewId: videoId } : p)),
      use: (index: number, candidate: Candidate) => {
        setPanel(null);
        applyEdit(index, { action: "choose", candidate }, "Match updated");
      },
      remove: (m) => {
        setPanel((p) => (p?.index === m.index ? null : p));
        applyEdit(m.index, { action: "remove" }, `Removed ${m.track.title}`);
      },
      undo: (m) => applyEdit(m.index, { action: "restore" }, `Restored ${m.track.title}`),
      retry: (m) => {
        announce("Retrying");
        applyEdit(m.index, { action: "retry" }, `Searched again for ${m.track.title}`);
      },
    }),
    [applyEdit, announce],
  );

  const retryErrors = useCallback(() => {
    const id = jobIdRef.current;
    if (!id) return;
    announce("Retrying");
    api.retryErrors(id).catch(() => announce("Retry failed"));
  }, [announce]);

  const createPlaylist = async () => {
    if (!job.jobId) return;
    setCreating(true);
    setCreateError("");
    try {
      setLinks(await api.links(job.jobId));
      setPanel(null);
      dispatch({ type: "screen", screen: "result" });
      announce("Your YouTube playlist is ready");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Couldn’t create the playlist");
    } finally {
      setCreating(false);
    }
  };

  const scr = job.screen;
  const isList = scr === "matching" || scr === "review";
  const settled = isSettled(job);
  const c = job.counts;

  return (
    <div className="app">
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onHome={goHome}
        showStartOver={scr !== "landing"}
      />
      <main id="main" className="main">
        <div aria-live="polite" className="sr-only">
          {live}
        </div>

        {scr === "landing" && (
          <Landing
            url={url}
            onUrl={(u) => {
              setUrl(u);
              setUrlError("");
            }}
            urlError={urlError}
            onUrlError={setUrlError}
            showPaste={showPaste}
            onTogglePaste={() => setShowPaste((s) => !s)}
            busy={busy}
            onConvertUrl={(u) => start({ url: u })}
            onConvertList={(text, name) => start({ text, name })}
          />
        )}

        {(scr === "fetching" || isList) && (
          <PlaylistCard
            playlist={job.playlist}
            progress={
              isList
                ? {
                    label: scr === "review" ? "Matching complete" : settled ? "Done" : "Searching YouTube…",
                    matched: c.high + c.medium + c.low,
                    counts: c,
                  }
                : null
            }
          />
        )}

        {scr === "fetching" && <Fetching loadingMore={job.loadingMore} />}

        {isList && (
          <MatchList
            isReview={scr === "review"}
            settled={settled}
            matches={job.matches}
            counts={c}
            filter={filter}
            onFilter={(f) => {
              setFilter(f);
              setPanel(null);
            }}
            panel={panel}
            handlers={handlers}
            searchRef={searchRef}
            onRetryErrors={retryErrors}
            onReview={() => {
              dispatch({ type: "screen", screen: "review" });
              announce("Review matches");
            }}
            onCreate={createPlaylist}
            creating={creating}
            createError={createError}
          />
        )}

        {scr === "result" && job.jobId && links && (
          <Result
            jobId={job.jobId}
            playlistName={job.playlist?.name ?? "Playlist"}
            links={links}
            counts={c}
            saveEnabled={saveEnabled}
            onSaveDisabled={() => setSaveEnabled(false)}
            announce={announce}
          />
        )}

        {scr === "error" && <ErrorScreen code={job.errorCode} onAction={onErrorAction} />}
      </main>
    </div>
  );
}
