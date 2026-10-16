import { describe, expect, it, vi } from "vitest";
import { googleNativeScript, googleTranslate, parseDict, parseGtx, type OnlineResult } from "@/engine/lyrics/google";
import { runLyrics, type Deps, type LineResult, type Mode, type Status } from "@/engine/lyrics/pipeline";
import { guessLanguageFromScript, isLatin, isRtl, lineKey, sameText, splitLines, uniqueLines } from "@/engine/lyrics/text";

const URDU = "یوں زندگی کی راہ میں ٹکرا گیا کوئی\nیوں زندگی کی راہ میں ٹکرا گیا کوئی\n\nاک روشنی اندھیروں میں بکھرا گیا کوئی";

describe("text", () => {
  it("keeps blank lines and dedupes repeated lines", () => {
    const lines = splitLines("a\r\nb\n\n a \n");
    expect(lines).toEqual(["a", "b", "", " a ", ""]);
    expect(uniqueLines(lines)).toEqual(["a", "b"]);
    expect(lineKey("  so   far  ")).toBe("so far");
  });
  it("tells scripts apart", () => {
    expect(isLatin("Café, déjà vu!")).toBe(true);
    expect(isLatin("tum hi ho तुम")).toBe(false);
    expect(isRtl("کوئی")).toBe(true);
    expect(isRtl("tum hi ho")).toBe(false);
  });
  it("guesses the language from the script", () => {
    expect(guessLanguageFromScript(URDU)).toBe("ur");
    expect(guessLanguageFromScript("مرحبا بالعالم")).toBe("ar");
    expect(guessLanguageFromScript("तुम ही हो")).toBe("hi");
    expect(guessLanguageFromScript("夜に駆ける")).toBe("ja");
    expect(guessLanguageFromScript("我爱你")).toBe("zh");
    expect(guessLanguageFromScript("사랑해요")).toBe("ko");
    expect(guessLanguageFromScript("I can remember")).toBeNull();
  });
  it("compares text loosely", () => {
    expect(sameText("Tum hi ho!", "tum  hi ho")).toBe(true);
    expect(sameText("tum hi ho", "you are the one")).toBe(false);
  });
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("google", () => {
  const gtx = {
    sentences: [{ trans: "You are the one ", orig: "तुम ही हो" }, { trans: "now", orig: "अब" }, { src_translit: "tum hī ho ab" }],
    src: "hi",
    ld_result: { srclangs: ["hi"], extended_srclangs: ["hi"] },
  };
  it("parses gtx (dj=1) with romanization", () => {
    expect(parseGtx(gtx)).toEqual({ translation: "You are the one now", transliteration: "tum hī ho ab", source: "hi", extended: "hi" });
    expect(parseGtx({ sentences: [{ trans: "It's you" }], src: "hi", ld_result: { extended_srclangs: ["hi-Latn"] } }).extended).toBe("hi-Latn");
    expect(() => parseGtx({ sentences: [] })).toThrow();
  });
  it("parses dict-chrome-ex", () => {
    expect(parseDict([["Thus, someone collided", "ur"]])).toEqual({ translation: "Thus, someone collided", source: "ur", extended: "ur" });
    expect(() => parseDict([])).toThrow();
  });
  it("falls back to dict-chrome-ex when gtx rate-limits", async () => {
    const fetchImpl = vi.fn((url: string) =>
      url.includes("/translate_a/single") ? Promise.resolve(new Response("<html>Sorry</html>", { status: 429 })) : json([["Slowly", "es"]]),
    );
    const r = await googleTranslate("Despacito", "en", fetchImpl as never);
    expect(r).toEqual({ translation: "Slowly", source: "es", extended: "es" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const gtxUrl = new URL(fetchImpl.mock.calls[0]![0]);
    expect(gtxUrl.searchParams.getAll("dt")).toEqual(["t", "rm"]);
    expect(gtxUrl.searchParams.get("q")).toBe("Despacito");
  });
  it("reports the gtx error when both fail", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response("", { status: 429 })));
    await expect(googleTranslate("x", "en", fetchImpl as never)).rejects.toThrow("429");
  });
  it("writes romanised text in its script with Input Tools", async () => {
    const fetchImpl = vi.fn(() => json(["SUCCESS", [["tum hi ho", ["तुम ही हो"], [], { candidate_type: [0] }]]]));
    expect(await googleNativeScript("tum hi ho", "hi", fetchImpl as never)).toBe("तुम ही हो");
    expect(new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]).searchParams.get("itc")).toBe("hi-t-i0-und");
  });
});

// Fake online service: translation = "EN(line)", transliteration = "LAT(line)" for non-Latin lines.
function fakeDeps(over: Partial<Deps> = {}): Deps & { calls: { online: string[] } } {
  const calls = { online: [] as string[] };
  return {
    calls,
    online: async (line): Promise<OnlineResult> => {
      calls.online.push(line);
      const latin = isLatin(line);
      const romanisedHindi = latin && /\b(tum|hai|ho)\b/i.test(line);
      return {
        translation: `EN(${line})`,
        transliteration: latin ? line : `LAT(${line})`,
        source: romanisedHindi ? "hi" : latin ? "en" : "ur",
        extended: romanisedHindi ? "hi-Latn" : latin ? "en" : "ur",
      };
    },
    native: async (line) => `NATIVE(${line})`,
    detect: async () => null,
    translator: async () => async (line) => `LOCAL(${line})`,
    ...over,
  };
}

async function run(lyrics: string, mode: Mode, deps: Deps, onlineAllowed = true) {
  const lines = new Map<string, LineResult>();
  const statuses: Status[] = [];
  await runLyrics(splitLines(lyrics), deps, {
    mode,
    onlineAllowed,
    target: "en",
    signal: new AbortController().signal,
    onLine: (k, r) => lines.set(k, r),
    onStatus: (s) => statuses.push(s),
  });
  return { lines, last: statuses.at(-1)!, statuses };
}

describe("runLyrics", () => {
  it("translates on-device when the browser has a model, without going online", async () => {
    const deps = fakeDeps({ detect: async () => "ur" });
    const { lines, last } = await run(URDU, "translate", deps, false);
    expect(lines.size).toBe(2); // repeated line done once
    expect([...lines.values()][0]!.translation).toMatch(/^LOCAL\(/);
    expect(deps.calls.online).toEqual([]);
    expect(last).toMatchObject({ kind: "done", text: "Urdu → English · on-device", online: false });
  });

  it("asks for online when there is no on-device model and online isn't allowed", async () => {
    const deps = fakeDeps({ translator: async () => null });
    const { last } = await run(URDU, "translate", deps, false);
    expect(last).toEqual({ kind: "needs-online", text: "Translating Urdu needs Google Translate online." });
    expect(deps.calls.online).toEqual([]);
  });

  it("asks for a click when the on-device model must be downloaded", async () => {
    const { last } = await run(URDU, "translate", fakeDeps({ translator: async () => "needs-click" }), false);
    expect(last.kind).toBe("needs-click");
  });

  it("goes online when there is no on-device model and online is allowed", async () => {
    const { lines, last } = await run(URDU, "translate", fakeDeps({ translator: async () => null }));
    expect([...lines.values()][0]!.translation).toMatch(/^EN\(/);
    expect(last).toMatchObject({ kind: "done", online: true });
  });

  it("transliterates only online", async () => {
    const offline = await run(URDU, "transliterate", fakeDeps(), false);
    expect(offline.last.kind).toBe("needs-online");
    const { lines } = await run(URDU, "both", fakeDeps({ detect: async () => "ur" }));
    const first = [...lines.values()][0]!;
    expect(first.translation).toMatch(/^LOCAL\(/);
    expect(first.transliteration).toMatch(/^LAT\(/);
  });

  it("writes romanised lyrics in their native script and translates them online", async () => {
    const deps = fakeDeps({ detect: async () => "hi-Latn" });
    const { lines, last } = await run("Tum hi ho\nAb tum hi ho", "both", deps);
    expect(lines.get("Tum hi ho")).toEqual({ translation: "EN(Tum hi ho)", transliteration: "NATIVE(Tum hi ho)" });
    expect(last).toMatchObject({ kind: "done", text: "Hindi in Latin letters · Google Translate online" });
  });

  it("skips translating songs already in English", async () => {
    const deps = fakeDeps({ detect: async () => "en" });
    const { lines, last } = await run("I can remember\nwhen we walked", "translate", deps);
    expect(lines.size).toBe(0);
    expect(last).toMatchObject({ kind: "done", text: "Already in English", online: false });
    const tl = await run("I can remember", "transliterate", fakeDeps({ detect: async () => "en" }));
    expect(tl.last).toMatchObject({ kind: "done", text: "English · Nothing to transliterate · Google Translate online" });
  });

  it("detects the language online, then from the script", async () => {
    const online = fakeDeps({ translator: async () => null });
    await run(URDU, "translate", online);
    expect(online.calls.online[0]).toContain("\n"); // the detection sample
    const offline = fakeDeps();
    const translator = vi.fn(async () => async (l: string) => `LOCAL(${l})`);
    await run(URDU, "translate", { ...offline, translator }, false);
    expect(translator).toHaveBeenCalledWith("ur", expect.any(Function));
  });

  it("reports lines that failed, e.g. no transliteration when gtx is rate-limited", async () => {
    const base = fakeDeps({ detect: async () => "ur" });
    const deps = { ...base, online: async (line: string) => ({ ...(await base.online(line)), transliteration: undefined }) };
    const { last } = await run(URDU, "transliterate", deps);
    expect(last).toEqual({ kind: "error", text: "2 of 2 lines couldn’t be done." });
  });

  it("stops quietly when aborted", async () => {
    const controller = new AbortController();
    const onLine = vi.fn();
    const deps = fakeDeps({
      detect: async () => {
        controller.abort();
        return "ur";
      },
    });
    await runLyrics(splitLines(URDU), deps, { mode: "translate", onlineAllowed: true, target: "en", signal: controller.signal, onLine, onStatus: () => {} });
    expect(onLine).not.toHaveBeenCalled();
  });
});
