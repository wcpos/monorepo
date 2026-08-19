import { expect } from '@playwright/test';

import {
	getStoreUrl,
	getStoreVariant,
	navigateToPage,
	authenticatedTest as test,
} from './fixtures';
import {
	createSearchProbe,
	deleteSearchProbe,
	mintSearchProbeToken,
	productWriterAuthorization,
} from './search-probe';

/**
 * The wire `orderby` the app emits when the cashier sorts the products grid by the
 * NAME column. The grid's column id is `name`, but the query translator maps it to
 * Woo's `title` (`wooOrderbyFor('products', 'name')` in
 * packages/query/src/engine-adapter/collection-map.ts) — and `name` is not even a
 * member of the supported products browse enum
 * (PRODUCT_BROWSE_WINDOW_ORDERBY_VALUES in
 * packages/sync-engine/src/scheduler/product-browse-window-descriptor.ts). Waiting
 * on `orderby=name` matches nothing and burns the whole wait budget.
 */
const NAME_SORT_WIRE_ORDERBY = 'title';

/**
 * Eco cadence is 300 seconds with up to 20% jitter (360s worst case). Keep 30
 * seconds for materialization after the latest supported poll fires.
 */
const ARRIVAL_TIMEOUT_MS = 6 * 60_000 + 30_000;

/**
 * The `posPage` fixture's own explicit deadlines. Playwright charges FIXTURE setup
 * to the test's timeout, and `test.setTimeout()` in the body re-sizes that budget
 * without refunding time already spent — so this has to be counted, not assumed
 * free: `search-products` visible (60s) + catalogue count ready (20s,
 * CATALOGUE_READY_TIMEOUT_MS) + the #1106 `screen-pos` pin (30s) = 110s, plus the
 * OPFS restore and two navigations.
 */
const FIXTURE_BUDGET_MS = 120_000;

/**
 * The explicit deadlines inside the test body before the arrival assertion:
 * navigate (12s) + grid census (60s) + name browse (60s) + anchor row (30s) =
 * 162s, rounded up to 180s for the wc/v3 writer login and probe-creation round
 * trips. Those round trips are request-timeout bounded and their pathological
 * paths throw rather than return late, so they cannot silently stretch the window
 * this budget guards.
 */
const SETUP_BUDGET_MS = 180_000;

/** Force-deleting the probe in the `finally` also spends the test budget. */
const TEARDOWN_BUDGET_MS = 30_000;

/**
 * The ceiling for EVERYTHING before the arrival assertion — fixture setup plus the
 * test body's own setup. Declared at file scope rather than as `test.setTimeout()`
 * in the body, because the body runs only after `posPage` has hydrated: an in-body
 * call leaves the whole of fixture setup governed by the 180s config default in
 * playwright.config.ts. `test.describe.configure` is applied at collection time, so
 * this covers the fixture too.
 *
 * This is a CEILING, not a reservation. It bounds a hung setup, and an overrun here
 * is reported against the step that overran — a diagnosis, not the false "the
 * product never arrived" that the arrival assertion would report. The arrival
 * window itself does not come out of this number; see below.
 */
const SETUP_TIMEOUT_MS = FIXTURE_BUDGET_MS + SETUP_BUDGET_MS;

test.describe.configure({ timeout: SETUP_TIMEOUT_MS });

/**
 * TIMEOUT ARITHMETIC — read this before changing any number above.
 *
 * The arrival assertion does NOT share a budget with setup. Predicting setup cost
 * and reserving the remainder is what failed twice here: first the fixture's 110s
 * of waits were unbudgeted, then the OAuth fallback's were. Every such prediction
 * is one unenumerated code path away from silently truncating the assertion, and
 * the truncation always presents as "the product never arrived" — a false failure
 * against the exact behaviour this spec exists to prove.
 *
 * So the arrival window is GRANTED, not predicted. Immediately before the
 * assertion, once setup is provably complete, the test extends its own budget by
 * the full arrival window plus teardown (Playwright's documented
 * `testInfo.setTimeout(testInfo.timeout + extra)` pattern):
 *
 *   reaching that line proves elapsed < SETUP_TIMEOUT_MS
 *   new deadline        = start + SETUP_TIMEOUT_MS + ARRIVAL + TEARDOWN
 *   remaining from here = that − elapsed  >  ARRIVAL + TEARDOWN
 *
 * The assertion therefore gets its full window no matter what setup actually cost,
 * with no term left to forget. Worst case the run can spend
 * SETUP_TIMEOUT_MS + ARRIVAL_TIMEOUT_MS + TEARDOWN_BUDGET_MS (720s), and only a
 * genuinely broken pipeline ever does — measured arrival on dev-pro is ~2 seconds.
 *
 * ARRIVAL_TIMEOUT_MS is the one term that must never be shrunk to make a sum fit:
 * it is the merchant's freshness contract, so trimming it trades a false failure
 * for a false pass.
 */
const ARRIVAL_GRANT_MS = ARRIVAL_TIMEOUT_MS + TEARDOWN_BUDGET_MS;

/**
 * Directional coverage: a record created on the SERVER while the till is open
 * must reach the cashier without a search and without a manual sync.
 *
 * The freshness contract is the merchant's own setting — `sync_check_interval_ms`
 * on the store document, wired to the engine's `changeSignalPollMs` by
 * `apps/main/components/sync-config-bridge.tsx`. Whatever interval a merchant
 * configures is the maximum staleness they have agreed to; a product added in
 * wp-admin must show up within it.
 *
 * Every other product spec creates its probe and then SEARCHES for it, and
 * search always issues server demand — so no other spec can tell the
 * difference between "the change-signal pipeline delivered it" and "the search
 * fetched it just now". This one never types a search term.
 *
 * MEASUREMENT NOTES (learned the hard way, 2026-08-19 — three false readings
 * before this method was sound):
 *  - Do NOT assert on the footer total: it is a cached census/server total and
 *    sits still while records genuinely arrive.
 *  - Do NOT assume a sort direction, and do not try to steer it with
 *    `menu_order`: read the direction from the actual name-browse request, then
 *    name the probe so it lands first under whatever sort is actually applied.
 *  - Do NOT assume the grid's column id reaches the wire: the name column sorts
 *    as `orderby=title` (see NAME_SORT_WIRE_ORDERBY above). Only the `order`
 *    parameter is read verbatim off the response.
 * Measured against dev-pro with that method: arrival in ~2 seconds.
 */
test('a product created on the server reaches the products grid without a search', async ({
	posPage: page,
	request,
	storeAuthorization,
}, testInfo) => {
	// The Products page is a Pro-only drawer screen (same gate every
	// products-page spec uses) — on free there is no grid to assert against.
	test.skip(getStoreVariant(testInfo) !== 'pro', 'Products page requires Pro');

	const storeUrl = getStoreUrl(testInfo);
	const writer = await productWriterAuthorization(request, storeUrl);
	const authorization = writer ?? storeAuthorization();

	await navigateToPage(page, 'products');
	const screen = page.getByTestId('screen-products').filter({ visible: true });
	await expect(screen.getByTestId('data-table-count')).toBeVisible({
		timeout: 60_000,
	});
	const sortedProductsPending = page.waitForResponse(
		(response) => {
			if (response.request().method() !== 'GET') return false;
			const url = new URL(response.url());
			const route = url.searchParams.get('rest_route');
			const isProductsBrowse =
				url.pathname.endsWith('/wp-json/wcpos/v2/products') || route === '/wcpos/v2/products';
			return isProductsBrowse && url.searchParams.get('orderby') === NAME_SORT_WIRE_ORDERBY;
		},
		{ timeout: 60_000 }
	);
	sortedProductsPending.catch(() => {});
	await screen.getByTestId('data-table-header-name').first().click();
	const sortedProducts = await sortedProductsPending;
	if (!sortedProducts.ok()) {
		throw new Error(`Products name browse failed: HTTP ${sortedProducts.status()}`);
	}
	const sortedUrl = new URL(sortedProducts.url());
	const order = sortedUrl.searchParams.get('order');
	if (order !== 'asc' && order !== 'desc') {
		throw new Error('Products name browse did not declare an asc/desc order');
	}
	const sortedBody: unknown = await sortedProducts.json().catch(() => null);
	if (!Array.isArray(sortedBody)) {
		throw new Error('Products name browse returned a malformed product list');
	}
	if (sortedBody.length === 0) {
		test.skip(true, 'Products name browse returned an empty catalog');
		return;
	}
	const anchor = sortedBody[0];
	const anchorSlug =
		anchor && typeof anchor === 'object' && 'slug' in anchor && typeof anchor.slug === 'string'
			? anchor.slug
			: '';
	if (!anchorSlug) {
		throw new Error('Products name browse first record is missing its slug');
	}
	await expect(screen.getByTestId(`data-table-row-${anchorSlug}`).first()).toBeVisible({
		timeout: 30_000,
	});

	// Land the probe in the first page of rendered rows under the sort that is
	// actually applied, so arrival needs no scrolling.
	const token = mintSearchProbeToken(testInfo.workerIndex);
	const created = await createSearchProbe({
		request,
		storeUrl,
		authorization,
		collection: 'products',
		workerIndex: testInfo.workerIndex,
		token,
		writerConfigured: Boolean(writer),
		productData: {
			name: `${order === 'desc' ? 'zzzz' : 'aaaa'} E2E Arrival ${token}`,
		},
	});
	if (!created.ok) {
		test.skip(true, created.reason);
		return;
	}

	// Setup is provably complete, so grant the arrival window rather than having
	// reserved it: reaching this line proves elapsed < SETUP_TIMEOUT_MS, and the new
	// deadline is SETUP_TIMEOUT_MS + ARRIVAL_GRANT_MS from the test's start — so at
	// least the full arrival window plus teardown remains, whatever setup cost. See
	// the TIMEOUT ARITHMETIC note above for why this is granted and not predicted.
	test.setTimeout(testInfo.timeout + ARRIVAL_GRANT_MS);

	try {
		if (!created.probe.rowTestId) {
			throw new Error('Arrival probe is missing its slug-derived row testID');
		}
		await expect(
			screen.getByTestId(created.probe.rowTestId),
			'a product created on the server must reach the grid without a search or manual sync'
		).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
	} finally {
		await deleteSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'products',
			id: created.probe.id,
		});
	}
});
