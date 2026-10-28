// Which of a page's request headers a fetch() from the same page should send again.

/** Headers the browser sets itself; fetch() refuses or ignores them. */
export const BROWSER_HEADERS =
  /^(:|sec-|cookie$|host$|content-length$|connection$|origin$|referer$|user-agent$|accept-encoding$|priority$|keep-alive$|te$|trailer$|transfer-encoding$|upgrade$|via$|dnt$|date$|expect$)/i;

export function resendableHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !BROWSER_HEADERS.test(k)));
}
