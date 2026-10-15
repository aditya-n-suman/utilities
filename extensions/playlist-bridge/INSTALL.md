# Install Playlist Bridge

Playlist Bridge isn't in the Chrome Web Store, so Chrome installs it as an "unpacked" extension. It takes about two
minutes and you only do it once.

## Chrome, Edge or Brave

1. **Download** `playlist-bridge-extension-<version>-chrome.zip` from the
   [latest release](https://github.com/aditya-n-suman/utilities/releases?q=playlist-bridge&expanded=true).
2. **Unzip it into a folder you'll keep**, for example `Documents/Playlist Bridge`. The browser loads the extension
   from that folder every time it starts, so don't leave it in Downloads or delete it.
3. **Open the extensions page:** type `chrome://extensions` in the address bar (`edge://extensions` in Edge,
   `brave://extensions` in Brave).
4. **Turn on Developer mode.** The switch is at the top right (in Edge, on the left).
5. **Click "Load unpacked"** and pick the folder from step 2. That's the folder that has `manifest.json` directly
   inside it.
6. **Pin it and open it:** click the puzzle-piece icon in the toolbar, pin Playlist Bridge, then click its icon.

You can leave Developer mode on. If the browser shows a notice about developer-mode extensions, that's expected for
extensions installed this way.

## Updating

When a new version is out, Playlist Bridge shows an **Update to x.y.z** button at the top right.

1. Download the new Chrome zip from that link.
2. Delete the files inside your Playlist Bridge folder and unzip the new version into the **same folder**.
3. On the extensions page, click the ↻ (reload) icon on the Playlist Bridge card.

Your saved matches, unfinished conversion and settings are kept.

## Firefox

Release Firefox only installs signed add-ons. If the release has a `.xpi` file attached, open it in Firefox and click
**Add**. Otherwise see the Firefox notes in [README.md](README.md#install-unpacked--self-distributed).

## Check the download (optional)

Each release lists SHA-256 checksums in `SHA256SUMS.txt`. Only download Playlist Bridge from this repository's
releases page: the extension can use your YouTube session to save playlists, so don't install copies from anywhere else.

- macOS / Linux: `shasum -a 256 playlist-bridge-extension-<version>-chrome.zip`
- Windows (PowerShell): `Get-FileHash playlist-bridge-extension-<version>-chrome.zip`

## Problems

| What you see | What to do |
|---|---|
| "Manifest file is missing or unreadable" | You picked the wrong folder. Pick the one with `manifest.json` directly inside it |
| The extension disappeared or shows an error after a restart | The folder was moved or deleted. Unzip again and load it again |
| Two Playlist Bridge cards | Remove the older one. Versions before 1.1.0 used a different extension ID, so their saved matches don't carry over |
| Anything else | ⋯ → **Report a problem** in the extension |
