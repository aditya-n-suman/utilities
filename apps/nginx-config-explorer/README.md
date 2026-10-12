# nginx -T Explorer

Open the output of `nginx -T` and browse it like a JSON viewer. Every `{ }` block folds, every `include` opens where nginx reads it, and search reveals matches inside folded blocks. The goal is to read a 5,000-line aggregated config one block at a time.

Everything runs in the browser. The file is read with `FileReader` and never sent anywhere. That matters because configs hold internal hostnames, upstream IPs and key paths.

## Use it

```bash
sudo nginx -T > nginx-full.txt                      # on the host
docker exec web nginx -T > nginx-full.txt           # in a container
kubectl exec deploy/web -- nginx -T > nginx-full.txt
```

Then drop the file on the page, choose it, or paste the text. Any plain-text file works, with or without an extension. A single `nginx.conf` with no `# configuration file` headers also works.

| | |
|---|---|
| **Merged includes** | Starts at the first file (the main config). Each `include` becomes a foldable node holding the files it matches, so `conf.d/*.conf` and `sites-enabled/*` appear where nginx loads them. Files the main config never reaches are listed at the end, marked *not included from the main config*. |
| **By file** | One node per file, in the order nginx printed them. |
| **Folded blocks** | Show a summary: `listen 443 ssl http2 · example.com · 5 locations`, `2 servers`, `proxy_pass http://app · 4 directives`, `12 mime types`. |
| **Toolbar** | Expand all, Collapse all, expand to level 1, 2 or 3, and show or hide comments. |
| **Search** | Plain text (case-insensitive) or `/regex/`. Matches open their parent blocks. Enter and Shift+Enter step through them, Esc clears. |
| **Outline** | Servers and upstreams (merged view) or files (by-file view). Click one to open the tree down to it. |
| **Keyboard** | In the tree: ↑ ↓ to move, → ← to open or close (or go to the parent), Enter or Space to toggle, Home and End to jump. Alt-click or Alt+→ opens or closes a whole subtree. |
| **Hover** | Hovering any line shows its `file:line`. The gutter shows the line number inside its own file. |

## Run, test, build

```bash
cd apps/nginx-config-explorer
npm install
npm test          # parser tests (vitest)
npm run dev       # http://localhost:5173
npm run build     # static site in dist/ (relative paths, host it anywhere)
```

## Code map

```
design/                 the approved Claude Design canvas (open a dump, explore)
src/
  App.tsx               upload ↔ explorer switch
  sample.ts             "Try a sample config" dump
  parser/
    split.ts            nginx -T text → status lines + files (split on "# configuration file X:")
    tokenize.ts         nginx lexer: words, quoted strings, # comments, ${var}, { } ;, raw *_lua_block bodies
    parse.ts            tokens → tree; tolerant (warnings instead of errors)
    build.ts            merged view (include resolution with glob(3) patterns) and by-file view
    summary.ts          one-line summaries for folded blocks
    syntax.ts           token colours
    search.ts           text and /regex/ search, highlight splitting
    rows.ts             visible rows, expand-to-level, outline
    parser.test.ts
  components/
    Upload.tsx          drop zone, file picker, paste, sample
    Explorer.tsx        header, toolbar, outline, tree, keyboard navigation
    TreeRow.tsx         one line of the tree
```

## How the parser behaves

- Relative `include` paths resolve against the main config's folder (`/etc/nginx/` for `/etc/nginx/nginx.conf`), the usual `--conf-path` prefix.
- `nginx -T` prints each file once even when it is included in several places. The merged view inlines it at every include site.
- An include that matches nothing in the dump is marked **not in dump**. A file that includes itself, directly or through other files, is shown once and marked as a loop.
- Lua blocks (`content_by_lua_block { … }` and similar) are kept verbatim, so braces inside Lua strings don't break the nesting.
- Broken input never throws. A stray `}`, a missing `}` or a missing `;` shows up under the *parse warnings* pill in the header.

## Limits

- Rows aren't virtualized. Collapsed blocks render nothing, and off-screen rows skip layout (`content-visibility`). Expand all on a 13,500-line dump takes about 2 s in headless Chromium. Virtualizing the list would be the next step if huge dumps are common.
- Light theme only, matching the design.
