/**
 * Token model for the auth seam (roadmap P1-3) — the PURE companion to
 * `authSession`. `authSession` decides WHEN to refresh; this module holds the
 * current token and decides HOW to attach it to a request. No fetch, no DOM.
 *
 * The `?authorization=` query-param fallback encodes a 1.9.x learning (gap
 * analysis §4.2): some hosts strip the `Authorization` header, so the client
 * probes for header survival (the `/auth/test` capability endpoint) and, when the
 * header will not survive, carries the token as a query param instead.
 */

/** How the token is attached to an outbound request. */
export type AuthTransport = 'header' | 'query';

/** The mutable token slot a refresh writes through; every request reads it. */
export type AuthTokenStore = {
  get(): string | null;
  set(token: string | null): void;
  clear(): void;
};

export function createAuthTokenStore(initial: string | null = null): AuthTokenStore {
  let token = initial;
  return {
    get: () => token,
    set: (next) => {
      token = next;
    },
    clear: () => {
      token = null;
    },
  };
}

/**
 * Choose the transport from a header-survival probe: prefer the `Authorization`
 * header (it keeps the token out of URLs, access logs, and referrers) and fall
 * back to the query param only when the header will not survive the host.
 */
export function chooseAuthTransport(authorizationHeaderSurvives: boolean): AuthTransport {
  return authorizationHeaderSurvives ? 'header' : 'query';
}

/** A request to authorize — the url plus any headers already set. */
export type AuthorizableRequest = { url: string; headers?: Record<string, string> };
/** The authorized request — a COPY; the input is never mutated. */
export type AuthorizedRequest = { url: string; headers: Record<string, string> };

/** Split a url into `{ base, fragment }` around the first `#`. */
function splitFragment(url: string): { base: string; fragment: string } {
  const hashIndex = url.indexOf('#');
  return hashIndex === -1
    ? { base: url, fragment: '' }
    : { base: url.slice(0, hashIndex), fragment: url.slice(hashIndex) };
}

/** Copy `headers` dropping any case-variant `authorization` key (so the token is single-sourced). */
function withoutAuthorizationHeader(headers: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'authorization') {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/** Drop any existing case-variant `authorization` query param (before any `#fragment`). */
function withoutAuthorizationParam(url: string): string {
  const { base, fragment } = splitFragment(url);
  const queryIndex = base.indexOf('?');
  if (queryIndex === -1) {
    return url;
  }
  const path = base.slice(0, queryIndex);
  const kept = base
    .slice(queryIndex + 1)
    .split('&')
    .filter((pair) => pair !== '' && pair.split('=')[0].toLowerCase() !== 'authorization');
  return kept.length > 0 ? `${path}?${kept.join('&')}${fragment}` : `${path}${fragment}`;
}

/** Append `key=value` (value URL-encoded) to a url, before any `#fragment`. */
function appendQueryParam(url: string, key: string, value: string): string {
  const { base, fragment } = splitFragment(url);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${key}=${encodeURIComponent(value)}${fragment}`;
}

/**
 * Attach `token` to `request` by the chosen transport, returning a COPY (the input
 * request and its headers object are never mutated). The result carries the token
 * EXACTLY ONCE via `transport` and no stale auth artifact in the OTHER channel, so
 * attaching is idempotent and safe to re-run on a refresh/retry:
 *   - `header` mode → `Authorization: Bearer <token>` (any prior case-variant
 *     `authorization` header is replaced, never doubled — `fetch` would otherwise
 *     merge two keys into `Bearer old, Bearer new`);
 *   - `query` mode → an URL-encoded `authorization` query param carrying the SAME
 *     `Bearer <token>` value as the header (the header-stripping fallback, §4.2),
 *     replacing any prior `authorization` param.
 * Either way a stale token in the unused channel is dropped.
 *
 * The query param is the full `Bearer <token>` string, NOT a bare token: the WCPOS
 * server reads `?authorization=` through the same `sscanf('Bearer %s')` extraction
 * as the header (`woocommerce-pos/includes/Init.php` `get_auth_header_early`), so a
 * bare token would fail to authenticate on the header-stripping hosts this exists for.
 */
export function attachAuthToken(
  request: AuthorizableRequest,
  token: string,
  transport: AuthTransport,
): AuthorizedRequest {
  const bearer = `Bearer ${token}`;
  const headers = withoutAuthorizationHeader({ ...(request.headers ?? {}) });
  const url = withoutAuthorizationParam(request.url);
  if (transport === 'header') {
    return { url, headers: { ...headers, Authorization: bearer } };
  }
  return { url: appendQueryParam(url, 'authorization', bearer), headers };
}
