import { InvalidPlaylistLink } from "../errors";
import { http } from "../http";

const ID = "[A-Za-z0-9]{22}";
const URI_RE = new RegExp(`^spotify:playlist:(${ID})$`);
const ID_RE = new RegExp(`^${ID}$`);
const PATH_RE = new RegExp(`/(?:intl-[a-z]{2}(?:-[a-z]{2})?/)?(?:embed/)?playlist/(${ID})(?:/|$)`, "i");
export const SHORT_HOSTS = ["spotify.link", "spoti.fi"];

const withScheme = (link: string) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);

/** Playlist id from a URL/URI without network access; null for short links that need resolving. */
export function parsePlaylistId(input: string): string | null {
  const link = input.trim();
  const uri = link.match(URI_RE);
  if (uri) return uri[1]!;
  if (ID_RE.test(link)) return link;
  let url: URL;
  try {
    url = new URL(withScheme(link));
  } catch {
    throw new InvalidPlaylistLink();
  }
  const host = url.hostname.toLowerCase();
  if (SHORT_HOSTS.includes(host)) return null;
  if (host !== "open.spotify.com" && host !== "play.spotify.com") throw new InvalidPlaylistLink();
  const m = url.pathname.match(PATH_RE);
  if (m) return m[1]!;
  throw new InvalidPlaylistLink();
}

export const isShortLink = (input: string) => {
  try {
    return SHORT_HOSTS.includes(new URL(withScheme(input.trim())).hostname.toLowerCase());
  } catch {
    return false;
  }
};

export async function resolvePlaylistId(link: string): Promise<string> {
  const id = parsePlaylistId(link);
  if (id) return id;
  // Short share links redirect to the canonical open.spotify.com URL.
  const resp = await http(withScheme(link.trim()), { redirect: "follow" });
  const resolved = parsePlaylistId(resp.url);
  if (!resolved) throw new InvalidPlaylistLink("Could not resolve the short link to a playlist.");
  return resolved;
}
