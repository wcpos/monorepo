/**
 * Authorized fetcher (roadmap P1-3) — the composition root that assembles the pure
 * auth spine into one request wrapper: the token store (`authToken`) holds the
 * credential, `attachAuthToken` applies it by the chosen transport, and the auth
 * session (`authSession`) drives 401→refresh→retry (single-flight, bounded).
 *
 * It is a `Fetcher → Fetcher` DECORATOR whose `(url, init?: RequestInit)` shape
 * matches the lab's transports, so it drops straight in front of the pull adapter
 * and the write path (`recordPushAdapter`'s `(url, init?: RequestInit)` fetcher).
 * Only `url` (query transport may add a param) and `headers` (the token) are
 * rewritten; every other `init` field — `method`, `body`, and the rest — is
 * forwarded verbatim, so authenticated create/update/delete calls keep their
 * payload. Any `HeadersInit` form the caller passes (a `Headers` instance, a tuple
 * array, or a plain record) is normalized first, so pre-set headers are never lost.
 *
 * Still transport/DOM-free otherwise: the caller injects the actual transport and a
 * `refreshToken` that acquires a new token and writes it into the same store this
 * fetcher reads (the store is the seam between refresh and request). This is what
 * production wiring calls; the fetcher itself owns no token acquisition or I/O.
 */

import { createAuthSession } from './authSession';
import { attachAuthToken, type AuthTokenStore, type AuthTransport } from './authToken';

/** The request options the fetcher accepts — the standard `RequestInit`, for drop-in compatibility. */
export type AuthorizedFetchInit = RequestInit;

/** The assembled fetcher: attaches the current token, performs, and refreshes-and-retries on 401. */
export type AuthorizedFetcher<Res> = (url: string, init?: AuthorizedFetchInit) => Promise<Res>;

/** An abort surfaced for an already-cancelled request (matches the `error.name === 'AbortError'` convention). */
function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error('The authorized request was aborted');
  error.name = 'AbortError';
  return error;
}

/** Normalize any `HeadersInit` form (Headers instance, tuple array, or record) to a plain record. */
function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (Array.isArray(headers)) {
    const out: Record<string, string> = {};
    for (const [key, value] of headers) {
      out[key] = value;
    }
    return out;
  }
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  return { ...(headers as Record<string, string>) };
}

export function createAuthorizedFetcher<Res extends { status: number }>(input: {
  /** The HTTP transport — same `(url, init)` shape as the lab's fetchers; returns a response with a `status`. */
  transport: (url: string, init: AuthorizedFetchInit) => Promise<Res>;
  /** The token slot read on every attempt; `refreshToken` writes the new token here. */
  tokenStore: AuthTokenStore;
  /** How to attach the token — from a `chooseAuthTransport` header-survival probe. */
  authTransport: AuthTransport;
  /** Acquire a new token and store it (via `tokenStore.set`). Coalesced single-flight by the session. */
  refreshToken: () => Promise<void>;
  /** Bounded refreshes before a persistent 401 surfaces (default 1). */
  maxRefreshAttempts?: number;
}): AuthorizedFetcher<Res> {
  const session = createAuthSession({
    refreshToken: input.refreshToken,
    maxRefreshAttempts: input.maxRefreshAttempts,
  });

  return async (url, init) => {
    const attempt = await session.run(async () => {
      // Bail before performing if the caller already aborted (e.g. a scope switch /
      // offline transition) — including on the post-refresh retry, so we never hit
      // the transport for abandoned work.
      if (init?.signal?.aborted) {
        throw abortError(init.signal);
      }
      const baseHeaders = normalizeHeaders(init?.headers);
      const token = input.tokenStore.get();
      // Re-read the token EACH attempt so the retry after a refresh carries the new one.
      const authorized = token !== null
        ? attachAuthToken({ url, headers: baseHeaders }, token, input.authTransport)
        : { url, headers: baseHeaders };
      // Forward every other init field (method, body, signal, …) verbatim; only url
      // + headers are rewritten with the attached credential.
      const response = await input.transport(authorized.url, { ...init, headers: authorized.headers });
      // If the request aborted while the transport was resolving, do NOT let a 401
      // drive a refresh of the SHARED token store for work that's already abandoned
      // (the scope-guard relies on aborts to stop in-flight work) — surface the abort.
      if (init?.signal?.aborted) {
        throw abortError(init.signal);
      }
      return { status: response.status, result: response };
    });
    return attempt.result;
  };
}
