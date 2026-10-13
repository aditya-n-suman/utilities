"""End-to-end test of the built Chrome extension against live Spotify and YouTube (needs network).

    npm run build && python3 tests/e2e/e2e.py [.output/chrome-mv3] [--shots DIR]

Requires `pip install playwright` and a Chromium (set CHROMIUM_EXECUTABLE to use an existing one,
otherwise run `playwright install chromium`). Firefox: load .output/firefox-mv3 manually (see SETUP.md).
Not covered (needs a signed-in YouTube account): the signed-in save path; run the manual check in SETUP.md.
"""
import asyncio
import os
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
EXT = str(Path(args[0]).resolve()) if args else str(ROOT / ".output" / "chrome-mv3")
SHOTS = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
EXAMPLE = "https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe"  # All Out 80s, 150 tracks


def step(msg: str) -> None:
    print(f"✓ {msg}", flush=True)


async def shot(page, name: str, **kw) -> None:
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        await page.screenshot(path=str(SHOTS / f"{name}.png"), **kw)


async def main() -> None:
    async with async_playwright() as p:
        launch = {"executable_path": os.environ["CHROMIUM_EXECUTABLE"]} if os.environ.get("CHROMIUM_EXECUTABLE") else {}
        ctx = await p.chromium.launch_persistent_context(
            "", headless=True, viewport={"width": 1280, "height": 900}, locale="en-US",
            args=["--no-sandbox", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], **launch,
        )
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker", timeout=15000)
        app = f"chrome-extension://{sw.url.split('/')[2]}/app.html"
        errors: list[str] = []
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))

        await pg.goto(app)
        await pg.click("text=Try an example link")
        t0 = time.time()
        await pg.click("button:has-text('Convert')")
        await pg.wait_for_selector("text=/\\d+ \\/ 150 matched/", timeout=60000)
        await shot(pg, "1-matching")
        await pg.wait_for_selector("text=Review matches →", timeout=300000)
        step(f"150-track playlist matched in {time.time() - t0:.0f}s: {(await pg.text_content('.banner.done')).split('.')[1].strip()}")

        await pg.click("text=Review matches →")
        await pg.locator("button:has-text('Swap match')").first.click()
        await pg.locator("button.alt-use:not([disabled])").first.click()
        await pg.wait_for_selector("text=✓ Picked by you")
        await pg.locator("button:has-text('Search')").nth(1).click()
        await pg.keyboard.press("Enter")
        await pg.wait_for_selector("text=/\\d+ results/", timeout=30000)
        await pg.keyboard.press("Escape")
        await pg.locator("button.btn-remove").nth(2).click()
        await pg.wait_for_selector("text=Removed from playlist")
        step("review: swap, manual search, remove")

        await pg.reload()
        await pg.wait_for_selector("text=Pick up where you left off?", timeout=10000)
        await pg.click(".resume >> text=Resume")
        await pg.wait_for_selector("text=Create playlist", timeout=30000)
        assert await pg.locator("text=Removed from playlist").count() == 1, "removed track lost after resume"
        step("reload → resume keeps edits")

        await pg.click("button:has-text('Create playlist')")
        await pg.wait_for_selector("text=Your YouTube playlist is ready")
        sizes = [h.count(",") + 1 for h in await pg.locator("a:has-text('Open on YouTube')").evaluate_all("els => els.map(e => e.href)")]
        assert sizes == [50, 50, 49], sizes
        async with pg.expect_download() as dl:
            await pg.click("text=Download match report")
        assert (await dl.value).suggested_filename.endswith("YouTube matches.csv")
        await pg.wait_for_selector("text=Sign in to YouTube in this browser to save.", timeout=20000)
        await shot(pg, "2-result", full_page=True)
        step(f"result: links {sizes}, CSV, save card (signed out)")

        await pg.click("text=Start over")
        await pg.fill("#pl-url", "https://open.spotify.com/playlist/AAAAAAAAAAAAAAAAAAAAAA")
        await pg.click("button:has-text('Convert')")
        await pg.wait_for_selector("text=We can’t see this playlist", timeout=30000)
        await pg.click("text=Paste a track list")
        await pg.fill("#paste-ta", "a-ha - Take On Me\nToto - Africa\nQueen - Bohemian Rhapsody")
        await pg.click("text=Convert list")
        await pg.wait_for_selector("text=Review matches →", timeout=60000)
        step("missing playlist → paste fallback")

        spotify = await ctx.new_page()
        await spotify.goto(EXAMPLE, wait_until="domcontentloaded")
        button = spotify.locator("playlist-bridge-button").locator("button.pb-button")
        await button.wait_for(timeout=30000)
        async with ctx.expect_page() as opened:
            await button.click()
        tab = await opened.value
        await tab.wait_for_selector("text=/\\d+ \\/ 150 matched/", timeout=60000)
        step(f"Spotify page button → app opened with {await tab.text_content('.playlist-name')!r}")

        await ctx.close()
        assert not errors, errors
        step("no page errors")


asyncio.run(main())
