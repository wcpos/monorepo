/**
 * Cold-start (thin local catalogue) E2E profile — wcpos/monorepo#991.
 *
 * WHY: every other spec runs against a fully-synced tiny demo catalogue, so a
 * query that silently falls back to local-residents-only still passes. That is
 * how #950 (variations search had no remote lane) and the #941–#945 filtered
 * browse family shipped invisible to CI. This profile removes the local
 * shortcut, so a missing remote lane shows up as an empty result set.
 *
 * TWO MECHANISMS, both deterministic (no sleeps):
 *
 *  1. A SEPARATE BOOTSTRAP SNAPSHOT. `global-setup.ts` authenticates a second
 *     time with {@link installThinCatalogueRoutes} already installed and
 *     `waitForCatalogue: false`, then exports OPFS. The resulting
 *     `.auth-state/pro-cold.json` is a genuine, RxDB-consistent login whose
 *     catalogue collections are empty — no surgery on RxDB's internals.
 *
 *  2. THE SAME ROUTE STUB PER TEST, so the catalogue cannot refill mid-run.
 *     The stub is surgical: only the BULK lanes over `/wcpos/v2/products` and
 *     `/wcpos/v2/customers` are answered locally. Anything carrying `include=`,
 *     `search=` or `sku=` (targeted pulls, search legs, the whole
 *     `/wcpos/v2/variations` route) goes to the real server untouched — those
 *     are exactly the lanes under test.
 *
 * The stub answers with an EMPTY page but a huge `X-WP-Total`. That total is
 * what the engine's catalogue-completeness gate reads (#979,
 * `require-plane.ts`: census total vs. local count). A zero total would make
 * the empty local catalogue look complete and re-enable the very serve-local
 * shortcut this profile exists to remove.
 *
 * Enable with `E2E_COLD_START=1` (the `pro-cold-start` project in
 * playwright.config.ts is gated on the same variable, and the extra OAuth
 * bootstrap costs ~2-5 min, so it is opt-in rather than part of every run).
 */

import { type APIRequestContext, test as base, type Page } from '@playwright/test';

import {
	captureStoreAuthorization,
	hydrateAuthenticatedPage,
	isRouteTeardownError,
	type StoreAuthorization,
} from './fixtures';

/**
 * Keep in sync with the same check in `playwright.config.ts` — the config
 * cannot import this module (it pulls in the test fixtures).
 */
export const COLD_START_ENABLED = /^(1|true)$/i.test(process.env.E2E_COLD_START ?? '');

/** Saved-state basename for the cold bootstrap (see `.auth-state/`). */
export const COLD_START_STATE_NAME = 'pro-cold';

/** Sync routes whose BULK (unfiltered) lanes fill the local catalogue. */
const CATALOGUE_BULK_ROUTES = new Set(['/wcpos/v2/products', '/wcpos/v2/customers']);

/** A request carrying any of these is targeted/search work, never a bulk fill. */
const TARGETED_PARAMS = ['include', 'search', 'sku'] as const;

/**
 * Larger than any test catalogue, so `localCount >= censusTotal` is never true
 * and the completeness gate can never serve local.
 */
const UNREACHABLE_TOTAL = '1000000';

const STUB_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
	'Access-Control-Expose-Headers': 'X-WP-Total, X-WP-TotalPages, Link',
	'X-WP-Total': UNREACHABLE_TOTAL,
	// One page: the browse walk stops on the first short page, and phase 2's
	// tiebreak walk is bounded by the advertised page count.
	'X-WP-TotalPages': '1',
};

/**
 * The sync route a URL addresses, e.g. `/wcpos/v2/products`. Handles both
 * pretty permalinks (`/wp-json/wcpos/v2/products`) and the plain-permalink
 * `?rest_route=` form, and tolerates WordPress in a subdirectory.
 */
function syncRouteOf(url: URL): string | null {
	const restRoute = url.searchParams.get('rest_route');
	const pathname = (restRoute ?? url.pathname).split('?')[0].replace(/\/+$/, '');
	const match = /\/wcpos\/v2\/[a-z-]+$/.exec(pathname);
	return match ? match[0] : null;
}

/** True when this URL is a catalogue BULK read that the profile must starve. */
export function isCatalogueBulkRequest(rawUrl: string): boolean {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return false;
	}
	const route = syncRouteOf(url);
	if (route === null || !CATALOGUE_BULK_ROUTES.has(route)) {
		return false;
	}
	return !TARGETED_PARAMS.some((param) => (url.searchParams.get(param) ?? '') !== '');
}

/**
 * Starve the catalogue's bulk lanes on `page`. Must run before the app's JS
 * boots; `hydrateAuthenticatedPage`'s `beforeBoot` hook is the intended caller.
 */
export async function installThinCatalogueRoutes(page: Page): Promise<void> {
	await page.route(
		(url) => isCatalogueBulkRequest(url.toString()),
		async (route) => {
			try {
				if (route.request().method() === 'OPTIONS') {
					await route.fulfill({ status: 204, headers: STUB_HEADERS });
					return;
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					headers: STUB_HEADERS,
					body: '[]',
				});
			} catch (error) {
				if (!isRouteTeardownError(error)) {
					throw error;
				}
			}
		}
	);
}

export type VariationSearchProbe =
	{ supported: true; sku: string } | { supported: false; reason: string };

/**
 * Does the store's REST index advertise `search` on the variations route?
 *
 * The namespace index is unauthenticated, so this answers the capability
 * question even when the Authorization capture came up empty.
 * wcpos/woocommerce-pos#1441 registers `search`/`sku`/`page`/`per_page`
 * alongside the pre-existing `include`.
 */
async function variationsRouteAdvertisesSearch(
	request: APIRequestContext,
	storeUrl: string
): Promise<boolean | null> {
	const response = await request.get(`${storeUrl.replace(/\/+$/, '')}/wp-json/wcpos/v2`, {
		headers: { 'X-WCPOS': '1' },
		failOnStatusCode: false,
	});
	if (!response.ok()) return null;
	const body = (await response.json().catch(() => null)) as {
		routes?: Record<string, { endpoints?: { args?: Record<string, unknown> }[] }>;
	} | null;
	const route = body?.routes?.['/wcpos/v2/variations'];
	if (!route) return null;
	return (route.endpoints ?? []).some((endpoint) => 'search' in (endpoint.args ?? {}));
}

/**
 * Probe whether the store can serve `GET /wcpos/v2/variations?search=…`.
 *
 * Pre-wcpos/woocommerce-pos#1441 the route only knows include mode: it does not
 * register a `search` arg, and answers 400 (`woocommerce_pos_sync_missing_ids`)
 * when no ids are supplied. With the search mode deployed it registers the arg
 * and answers 200 with the usual `{documents, meta}` envelope. Both signals are
 * checked. The probe doubles as SEED DISCOVERY: it returns the full SKU of a
 * real matching variation, so the spec never hard-codes catalogue contents.
 *
 * Runs through Playwright's APIRequestContext, which is not affected by the
 * page's route stubs.
 */
export async function probeVariationSearch(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization | null,
	term: string
): Promise<VariationSearchProbe> {
	const advertised = await variationsRouteAdvertisesSearch(request, storeUrl);
	if (advertised === false) {
		return { supported: false, reason: 'variations route registers no `search` arg' };
	}
	if (!authorization) {
		return { supported: false, reason: 'no store authorization was observed' };
	}
	const endpoint = `${storeUrl.replace(/\/+$/, '')}/wp-json/wcpos/v2/variations`;
	const response = await request.get(endpoint, {
		params: {
			search: term,
			per_page: 1,
			...(authorization.transport === 'query' ? { authorization: authorization.value } : {}),
		},
		headers: {
			...(authorization.transport === 'header' ? { Authorization: authorization.value } : {}),
			'X-WCPOS': '1',
		},
		failOnStatusCode: false,
	});
	if (response.status() === 400) {
		return {
			supported: false,
			reason: 'store answered 400 (include-only variations route)',
		};
	}
	if (!response.ok()) {
		return { supported: false, reason: `probe returned HTTP ${response.status()}` };
	}
	const body = (await response.json().catch(() => null)) as {
		documents?: { payload?: { sku?: unknown } }[];
	} | null;
	const sku = body?.documents?.[0]?.payload?.sku;
	if (typeof sku !== 'string' || sku.length === 0) {
		return { supported: false, reason: `no variation on this store matches "${term}"` };
	}
	return { supported: true, sku };
}

/**
 * Cold-start test: an authenticated POS page whose local catalogue is empty and
 * stays empty. Specs using it live in `*.cold.spec.ts` and run only in the
 * `pro-cold-start` project.
 */
export const coldStartTest = base.extend<{
	posPage: Page;
	storeAuthorization: () => StoreAuthorization | null;
}>({
	storeAuthorization: async ({ page }, use) => {
		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook
		await use(captureStoreAuthorization(page));
	},
	posPage: async ({ page, storeAuthorization }, use, testInfo) => {
		// `storeAuthorization` is a declared dependency so its request listener is
		// attached before the app boots and sends its first authenticated request.
		storeAuthorization();
		await hydrateAuthenticatedPage(page, testInfo, {
			stateName: COLD_START_STATE_NAME,
			waitForCatalogue: false,
			beforeBoot: installThinCatalogueRoutes,
		});

		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook
		await use(page);
	},
});
