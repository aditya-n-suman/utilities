"""Lyrics bar end-to-end in Chromium, on a stand-in YouTube Music page.

music.youtube.com is served from tests/e2e/fixtures/ytmusic-lyrics.html (same elements as the real lyrics tab:
ytmusic-player-page > ytmusic-description-shelf-renderer > yt-formatted-string.description), so this runs where
YouTube Music can't be reached. The translation requests are real (Google), made by the extension's background.

    python3 tests/e2e/lyrics.py [.output/chrome-mv3]
"""
import asyncio
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
EXT = str(Path(sys.argv[1]).resolve()) if len(sys.argv) > 1 else str(ROOT / ".output" / "chrome-mv3")
FIXTURE = (Path(__file__).parent / "fixtures" / "ytmusic-lyrics.html").read_text(encoding="utf-8")
SHOT = os.environ.get("LYRICS_SCREENSHOT")
ENGLISH = "I can remember when we walked together\nSharing a love I thought would last forever"


async def main():
    async with async_playwright() as p:
        launch = {"executable_path": os.environ["CHROMIUM_EXECUTABLE"]} if os.environ.get("CHROMIUM_EXECUTABLE") else {}
        ctx = await p.chromium.launch_persistent_context(
            "", headless=True, args=["--no-sandbox", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], **launch
        )
        await ctx.route("https://music.youtube.com/**", lambda route: route.fulfill(status=200, content_type="text/html", body=FIXTURE))
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("https://music.youtube.com/watch?v=test")

        bar = page.locator(".playlist-bridge-lyrics .bar")
        desc = page.locator("ytmusic-description-shelf-renderer .description")
        await expect(bar).to_be_visible(timeout=10_000)
        print("✓ bar shows above the lyrics")

        # Translate: no on-device model in test Chromium, so it asks to go online (after a stalled download, if any).
        await bar.get_by_role("button", name="Translate", exact=True).click()
        allow = page.get_by_role("button", name="Allow Google Translate online")
        await expect(allow).to_be_visible(timeout=45_000)
        await expect(desc).to_be_hidden()
        print("✓ asks before going online:", await page.locator(".playlist-bridge-lyrics .notice p").inner_text())

        await allow.click()
        status = page.locator(".playlist-bridge-lyrics .status")
        await expect(status).to_contain_text("Google Translate online", timeout=45_000)
        rows = page.locator(".playlist-bridge-lyrics .line")
        first = rows.first
        await expect(first.locator(".tr")).to_be_visible()
        print("✓ translated:", await status.inner_text())
        print("   ", (await first.locator(".orig").inner_text()), "→", await first.locator(".tr").inner_text())
        assert await first.get_attribute("class") == "line rtl extra", await first.get_attribute("class")
        assert await page.locator(".playlist-bridge-lyrics .gap").count() == 1, "blank line kept"
        assert await rows.count() == 3, await rows.count()  # the repeated line is drawn twice, translated once
        assert await rows.nth(0).locator(".tr").inner_text() == await rows.nth(1).locator(".tr").inner_text()
        if SHOT:
            await page.screenshot(path=SHOT, full_page=True)

        # Transliterate needs gtx, which rate-limits busy IPs (like CI). Either outcome is handled.
        await bar.get_by_role("button", name="Transliterate").click()
        await page.wait_for_function(
            """() => { const s = document.querySelector('.playlist-bridge-lyrics').shadowRoot.querySelector('.status').textContent;
                       return s.includes('Google Translate online') || s.includes('couldn’t be done'); }""",
            timeout=45_000,
        )
        tl_status = await status.inner_text()
        if "couldn’t" in tl_status:
            await expect(page.get_by_role("button", name="Retry")).to_be_visible()
            print("✓ transliteration: gtx refused from this IP, shown as an error with Retry:", tl_status)
        else:
            print("✓ transliterated:", await first.locator(".tl").inner_text())

        # Next song: English lyrics in translate mode need nothing.
        await bar.get_by_role("button", name="Translate", exact=True).click()
        await page.evaluate("t => document.querySelector('ytmusic-description-shelf-renderer .description').textContent = t", ENGLISH)
        await expect(status).to_contain_text("Already in English", timeout=20_000)
        await expect(rows.first.locator(".orig")).to_have_text("I can remember when we walked together")
        print("✓ song change followed:", await status.inner_text())

        # Off shows YouTube's own lyrics again.
        await bar.get_by_role("button", name="Off").click()
        await expect(desc).to_be_visible()
        await expect(page.locator(".playlist-bridge-lyrics .lyrics")).to_be_hidden()
        print("✓ Off restores YouTube's lyrics")

        assert not errors, errors
        await ctx.close()
        print("All lyrics checks passed.")


asyncio.run(main())
