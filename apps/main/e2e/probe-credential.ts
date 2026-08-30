/**
 * The credential a spec probes the store's REST API with — and the evidence that it works.
 *
 * `captureStoreAuthorization` (fixtures.ts) reports the last credential the app was seen
 * SENDING. It never checks that the store accepts it, and there are TWO independent,
 * both-observed ways that lets a spec down:
 *
 *  1. **Wrong transport for the route.** What reached `wcpos/v2` through whatever proxy sits
 *     in front does not automatically reach `wc/v3` — dev-free's hostile tier strips
 *     `Authorization` outright (wcpos-infra#72 Tier 3), so only the `?authorization=` forms
 *     authenticate there, and WAF prefix rules decide which of the two spellings survives.
 *  2. **A STALE token.** The access token lives 30 minutes and E2E auth state is cached
 *     (per-day in CI), so a restored session replays a token minted hours earlier. The app
 *     takes the 401, refreshes and carries on; the spec is left holding the dead JWT and
 *     every probe 401s — which reads exactly like a broken store (measured on PR #1528:
 *     expired by 732 s at probe time).
 *
 * So a probe credential is not something to take on trust. `resolveProbeAuthorization` walks
 * the transport ladder and, if none authenticates, RE-READS the getter and retries until the
 * app's own traffic yields a live credential or the budget expires.
 *
 * This module deliberately owns `StoreAuthorization`/`storeRequestOptions` rather than
 * importing them from fixtures.ts: fixtures.ts needs the ladder for its own order teardown,
 * and a fixtures -> search-probe -> fixtures import cycle is how that would otherwise be
 * spelled. fixtures.ts re-exports both, so every existing importer is unaffected.
 */
import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * How the app presents its store credentials: some sites accept the JWT in an
 * `Authorization` header, others (when `use_jwt_as_param` is set) can only take
 * it as a query parameter.
 */
export type StoreAuthorization = { transport: 'header' | 'query'; value: string };

/**
 * Request options that carry the app's own store credentials, for out-of-band
 * `APIRequestContext` calls (which page route stubs never touch).
 */
export function storeRequestOptions(authorization: StoreAuthorization | null): {
	headers: Record<string, string>;
	params: Record<string, string>;
} {
	return {
		headers: {
			'X-WCPOS': '1',
			...(authorization?.transport === 'header' ? { Authorization: authorization.value } : {}),
		},
		params: authorization?.transport === 'query' ? { authorization: authorization.value } : {},
	};
}

/**
 * The transports worth trying for a credential the app was seen using, in order.
 *
 * The captured form comes first — it demonstrably reached `wcpos/v2` — then the
 * alternates, because a credential that works on ONE route and transport does not
 * automatically work on another. Mirrors the candidate ladder `resolveWriterTransport`
 * (search-probe.ts) already uses for the minted writer token.
 *
 * Pure and exported for its own test: the ORDER is the contract.
 */
export function authorizationCandidates(captured: StoreAuthorization | null): StoreAuthorization[] {
	if (!captured) return [];
	const bare = captured.value.replace(/^Bearer\s+/i, '');
	const ladder: StoreAuthorization[] = [
		captured,
		{ transport: 'header', value: `Bearer ${bare}` },
		{ transport: 'query', value: `Bearer ${bare}` },
		{ transport: 'query', value: bare },
	];
	const seen = new Set<string>();
	return ladder.filter((candidate) => {
		const key = `${candidate.transport}:${candidate.value}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * The read used as PROOF that a credential is live, one per namespace a caller probes.
 *
 * Verifying against the namespace the caller will actually use is the whole point: a JWT
 * that authenticates on `wcpos/v2` can be stripped before `wc/v3` sees it, so proving one
 * says nothing about the other (failure mode 1 above). Each entry carries the extra query
 * params that namespace requires — `wcpos/v1` is marker-gated and answers an unmarked
 * request as if it did not exist.
 */
const VERIFICATION_ROUTES = {
	/** wc/v3 writes and reads: search probes, product/customer/order creation, deletes. */
	'/wc/v3/products': {},
	/** The order-teardown surface (order-cleanup.ts). Marker-gated. */
	'/wcpos/v1/orders': { wcpos: '1' },
	/** Order read-back and the push surface (order-lifecycle.ts). */
	'/wcpos/v2/orders': {},
	/** Catalogue reads that must be scoped exactly as the app scopes them. */
	'/wcpos/v2/products': {},
} as const satisfies Record<string, Record<string, string>>;

export type ProbeVerificationRoute = keyof typeof VERIFICATION_ROUTES;

/**
 * One verification GET, tolerating both permalink styles: the pretty `/wp-json/` path
 * first, and on WordPress's `rest_no_route` 404 the plain `?rest_route=` spelling.
 *
 * Not `probeRequest` from search-probe.ts: that helper is hard-wired to `wc/v3/<collection>`
 * and the routes above span three namespaces. Same store-agnostic requirement, same shape —
 * visibility-probe.ts carries its own copy for the same reason.
 */
async function verificationRead(
	request: APIRequestContext,
	storeUrl: string,
	route: ProbeVerificationRoute,
	options: { headers: Record<string, string>; params: Record<string, string> },
	deadline: number
): Promise<APIResponse> {
	const base = storeUrl.replace(/\/+$/, '');
	const params = { ...options.params, ...VERIFICATION_ROUTES[route], per_page: '1' };
	const pretty = await request.get(`${base}/wp-json${route}`, {
		...options,
		params,
		timeout: remainingRequestTimeout(deadline),
	});
	if (pretty.status() !== 404) return pretty;
	return request.get(`${base}/index.php`, {
		...options,
		params: { ...params, rest_route: route },
		timeout: remainingRequestTimeout(deadline),
	});
}

/**
 * Every verification request is bounded by what is LEFT of the resolver's budget.
 *
 * `APIRequestContext.get` waits 30 s by default, and the resolver can only look at its
 * deadline between candidates — so a store that accepts the connection and then says
 * nothing would spend 30 s per candidate and blow a 10 s teardown budget out to two
 * minutes. Floored at 1 ms rather than 0 because Playwright reads `timeout: 0` as
 * "no timeout at all", which is the opposite of what an exhausted budget means. The
 * ladder is still walked in full once — the candidates after the budget runs out simply
 * fail fast, and their statuses still reach the error message.
 */
function remainingRequestTimeout(deadline: number): number {
	return Math.max(1, deadline - Date.now());
}

/** How long to keep re-reading the app's credential while it is still a stale one. */
const PROBE_CREDENTIAL_TIMEOUT_MS = 45_000;
/** Gap between re-reads, long enough for the app to have sent another request. */
const PROBE_CREDENTIAL_POLL_MS = 2_000;

/**
 * The budget for teardown paths, which run AFTER the test on their own clock.
 *
 * Short on purpose: teardown is best-effort and swallows its failures, so a store that will
 * never yield a live credential must not add three quarters of a minute to every test in an
 * already-red run. One full ladder walk plus a couple of re-reads is all the recovery a
 * refresh-in-flight needs.
 */
export const TEARDOWN_CREDENTIAL_TIMEOUT_MS = 10_000;

export interface ResolveProbeCredentialOptions {
	timeoutMs?: number;
	/** Namespace to prove the credential against — default `wc/v3`, the probe write surface. */
	route?: ProbeVerificationRoute;
}

/**
 * Resolve — by evidence, not assumption — the credential that actually authenticates against
 * `route` on THIS store, starting from the credential the app was seen using.
 *
 * Deliberately never inspects the token's contents. Credentials are opaque here: the only
 * evidence that one is good is a store answering with it.
 *
 * Throws when nothing authenticates inside the budget. That is a genuinely broken
 * environment, and per the E2E store-agnostic policy (CLAUDE.md) it must fail rather than
 * skip — a skip here would hide an auth regression behind a green run.
 */
export async function resolveProbeAuthorization(
	request: APIRequestContext,
	storeUrl: string,
	getAuthorization: () => StoreAuthorization | null,
	options: ResolveProbeCredentialOptions = {}
): Promise<StoreAuthorization> {
	const route = options.route ?? '/wc/v3/products';
	const deadline = Date.now() + (options.timeoutMs ?? PROBE_CREDENTIAL_TIMEOUT_MS);
	let statuses: string[] = ['no credential captured'];
	let rounds = 0;
	for (;;) {
		rounds += 1;
		const candidates = authorizationCandidates(getAuthorization());
		if (candidates.length > 0) {
			statuses = [];
			for (const candidate of candidates) {
				try {
					const response = await verificationRead(
						request,
						storeUrl,
						route,
						storeRequestOptions(candidate),
						deadline
					);
					if (response.ok()) return candidate;
					statuses.push(`${candidate.transport}=${response.status()}`);
				} catch {
					statuses.push(`${candidate.transport}=transport-error`);
				}
			}
		}
		if (Date.now() >= deadline) break;
		await new Promise((resolve) => setTimeout(resolve, PROBE_CREDENTIAL_POLL_MS));
	}
	throw new Error(
		`the app's credential authenticated against no ${route} transport on ${storeUrl} after ${rounds} rounds (${statuses.join(', ')}) — the app never surfaced a working credential`
	);
}

/** {@link resolveProbeAuthorization}, shaped as request options for a caller that sends them verbatim. */
export async function resolveProbeOptions(
	request: APIRequestContext,
	storeUrl: string,
	getAuthorization: () => StoreAuthorization | null,
	options: ResolveProbeCredentialOptions = {}
): Promise<{ headers: Record<string, string>; params: Record<string, string> }> {
	return storeRequestOptions(
		await resolveProbeAuthorization(request, storeUrl, getAuthorization, options)
	);
}
