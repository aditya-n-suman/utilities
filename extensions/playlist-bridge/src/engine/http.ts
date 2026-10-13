import { NetworkError } from "./errors";

/** fetch with a timeout; network failures become NetworkError. */
export async function http(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 20_000, ...rest } = init;
  try {
    return await fetch(url, { ...rest, signal: rest.signal ?? AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const reason = e instanceof Error ? e.name : "error";
    throw new NetworkError(`Couldn't reach ${new URL(url).host} (${reason}).`);
  }
}
