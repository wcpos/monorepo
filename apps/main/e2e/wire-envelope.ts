/**
 * B9 wire-body envelope (wcpos-infra#72 spec §4; server free#1643, client mono#1405).
 *
 * Since mono#1405 the engine opts every non-push sync request into the
 * `_wcpos_envelope=1` body envelope, so the RAW wire body Playwright sees via
 * `response.json()` / `route.fetch()` is `{ data, _wcpos: { v: 1, ... } }`,
 * while the app reads the hydrated (unwrapped) view. Push acks, errors (>=400),
 * 304s and the spec's own APIRequestContext calls are never enveloped.
 *
 * Any helper that parses APP traffic must unwrap before asserting on shape —
 * and any helper that MUTATES a wire body must mutate inside the envelope and
 * serve the envelope back, or client hydration silently drops the mutation.
 */
export type WireEnvelope = { data: unknown; _wcpos: { v: number } };

export function isWireEnvelope(body: unknown): body is WireEnvelope {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
	if (!Object.prototype.hasOwnProperty.call(body, 'data')) return false;
	const meta = (body as { _wcpos?: unknown })._wcpos;
	return typeof meta === 'object' && meta !== null && (meta as { v?: unknown }).v === 1;
}

/** The app-visible payload of a raw wire body: the envelope's `data`, or the body itself. */
export function unwrapWireBody(body: unknown): unknown {
	return isWireEnvelope(body) ? body.data : body;
}

/** Re-shape a (possibly enveloped) wire body around a replaced payload, preserving the envelope. */
export function rewrapWireBody(originalBody: unknown, payload: unknown): unknown {
	return isWireEnvelope(originalBody) ? { ...originalBody, data: payload } : payload;
}
