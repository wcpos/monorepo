import { expect } from '@playwright/test';

import {
	getStoreUrl,
	getStoreVariant,
	navigateToPage,
	authenticatedTest as test,
} from './fixtures';
import {
	createOrderArrivalProbe,
	createSearchProbe,
	deleteSearchProbe,
	mintSearchProbeToken,
	productWriterAuthorization,
} from './search-probe';
import { unwrapWireBody } from './wire-envelope';

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
 * The leading token that puts the probe in the FIRST rendered rows, per direction.
 *
 * These are chosen against the RENDERER's comparator, not the server's collation —
 * the two disagree. MySQL sorts `post_title` under a case-INSENSITIVE collation, but
 * the client re-sorts resident documents with plain `<` code-unit ordering
 * (`compareValues` in packages/query/src/engine-adapter/execute-query.ts, whose own
 * comment spells it out: "code-unit order, 'Zoo' before 'apple'").
 *
 * So a lowercase `aaaa` lead — which the server WOULD sort first — renders after
 * every capitalized product name, because 'a' (0x61) > 'Z' (0x5A). The probe stays
 * resident but lands at the far end of the rendered list, off the first page, and
 * the arrival assertion fails for a reason that has nothing to do with arrival.
 *
 * A digit lead is first under BOTH orderings (digits precede letters in code-unit
 * order and in the server's collation), so ascending is safe from the disagreement.
 * Descending wants the highest code unit, and lowercase 'z' (0x7A) outranks every
 * letter under both.
 */
const ARRIVAL_PROBE_LEAD = { asc: '0000', desc: 'zzzz' } as const;

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
 * The explicit deadlines inside a test body before its arrival assertion, sized to
 * the WIDEST of the three setups in this file:
 *  - products: navigate (12s) + grid census (60s) + name browse (60s) + anchor row
 *    (30s) = 162s
 *  - orders: search visible (60s) + unscoped browse (60s) + three confirmed sort
 *    clicks (45s) + grid-or-empty poll (30s) = 195s
 *  - customers: search visible (60s) + three confirmed sort clicks (45s) + sorted
 *    browse (60s) + anchor row (30s) = 195s
 * rounded up to 240s for the wc/v3 writer login and probe-creation round trips.
 * Those round trips are request-timeout bounded and their pathological paths throw
 * rather than return late, so they cannot silently stretch the window this budget
 * guards.
 */
const SETUP_BUDGET_MS = 240_000;

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
	// Put the grid on another field first, so clicking Name deterministically selects ascending.
	const priceProductsPending = page.waitForResponse(
		(response) => {
			if (response.request().method() !== 'GET') return false;
			const url = new URL(response.url());
			const route = url.searchParams.get('rest_route');
			const isProductsBrowse =
				url.pathname.endsWith('/wp-json/wcpos/v2/products') || route === '/wcpos/v2/products';
			return isProductsBrowse && url.searchParams.get('orderby') === 'price';
		},
		{ timeout: 60_000 }
	);
	priceProductsPending.catch(() => {});
	await screen.getByTestId('data-table-header-price').first().click();
	const priceProducts = await priceProductsPending;
	if (!priceProducts.ok()) {
		throw new Error(`Products price browse failed: HTTP ${priceProducts.status()}`);
	}

	const sortedProductsPending = page.waitForResponse(
		(response) => {
			if (response.request().method() !== 'GET') return false;
			const url = new URL(response.url());
			const route = url.searchParams.get('rest_route');
			const isProductsBrowse =
				url.pathname.endsWith('/wp-json/wcpos/v2/products') || route === '/wcpos/v2/products';
			return (
				isProductsBrowse &&
				url.searchParams.get('orderby') === NAME_SORT_WIRE_ORDERBY &&
				url.searchParams.get('order') === 'asc'
			);
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
	// The raw wire body is B9-enveloped ({ data, _wcpos }) — the app reads the
	// hydrated view, but response.json() here reads the wire.
	const sortedBody = unwrapWireBody(await sortedProducts.json().catch(() => null));
	if (!Array.isArray(sortedBody)) {
		throw new Error('Products name browse returned a malformed product list');
	}
	// Emptiness is the ONE thing this body may still be asked: whether the browse
	// window has any records at all. Its ORDER is not usable — see below.
	if (sortedBody.length === 0) {
		test.skip(true, 'Products name browse returned an empty catalog');
		return;
	}

	/**
	 * Anchor on the RENDERED grid, never on `sortedBody[0]`.
	 *
	 * The client does not render the server's ordering verbatim. The wire response
	 * only decides WHICH records get pulled into the browse window; the grid then
	 * re-sorts the resident documents locally, and the two orderings disagree:
	 *
	 *  - Different collation. MySQL orders `post_title` case-INSENSITIVELY, while the
	 *    local comparator is plain `<` code-unit order — 'Zoo' before 'apple'
	 *    (`compareValues`, packages/query/src/engine-adapter/execute-query.ts). Sorting
	 *    products by `name` is always local: the field is `kind: 'payload'`, so it is
	 *    never pushed down to RxDB.
	 *  - Different tiebreak. Equal titles fall back to uuid locally, which has no
	 *    relationship to the server's ordering of the same rows.
	 *  - Different granularity. The captured response is ONE `pullBatchSize` page of a
	 *    window that may be walked over several requests, so it is not even guaranteed
	 *    to be the request that populated what is on screen.
	 *
	 * Asserting `data-table-row-${sortedBody[0].slug}` was visible therefore failed on
	 * dev-pro with "element(s) not found" — a wrong assumption, not a slow store.
	 * What this step actually needs is only "the grid has rendered rows under the sort
	 * that is actually applied", so take that from the DOM.
	 */
	await expect(screen.getByTestId(/^data-table-row-/).first()).toBeVisible({
		timeout: 30_000,
	});

	// Land the probe in the first page of rendered rows under the sort that is
	// actually applied, so arrival needs no scrolling. The lead token is chosen
	// against the RENDERER's ordering, not the server's — see ARRIVAL_PROBE_LEAD.
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
			name: `${ARRIVAL_PROBE_LEAD[order]} E2E Arrival ${token}`,
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

/** Anchor a Playwright text filter to the WHOLE cell value, not a substring of it. */
function exactCellText(value: string): RegExp {
	return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/**
 * Directional coverage for ORDERS (#1321). The issue's audit argued orders are
 * structurally immune to the #1302 suppression class because the maintenance seed,
 * the POS open-orders demand and the grid browse all carry different task keys —
 * but the coupon bug proved code reading cannot promise two descriptor spaces never
 * coincide, so the guard is empirical: create an order the way a WEB order arrives
 * (bare wc/v3 POST, no POS scope) and require it to surface in the Orders grid a
 * cashier is looking at, without a search and without a manual sync.
 *
 * The grid boots scoped to the signed-in cashier and the active store
 * (`initialFilters` in packages/core/src/screens/main/orders/index.tsx), and a web
 * order carries neither scope — so the spec first removes both filter pills, which
 * is exactly what a cashier does to see web orders. The arrival assertion then
 * targets the order-number CELL (testID `order-number`) by its exact rendered
 * value: order rows key their testID on a client-side uuid that does not exist
 * until the record materializes, so the number — which the create response hands
 * us — is the only value-bearing anchor knowable in advance. The number is record
 * DATA, not localized UI copy, which is what the selector policy guards against.
 */
test('an order created on the server reaches the orders grid without a search', async ({
	posPage: page,
	request,
	storeAuthorization,
}, testInfo) => {
	// The Orders page is a Pro-only drawer screen — on free there is no grid.
	test.skip(getStoreVariant(testInfo) !== 'pro', 'Orders page requires Pro');

	const storeUrl = getStoreUrl(testInfo);
	const writer = await productWriterAuthorization(request, storeUrl);
	const authorization = writer ?? storeAuthorization();

	await navigateToPage(page, 'orders');
	const screen = page.getByTestId('screen-orders').filter({ visible: true });
	await expect(screen.getByTestId('search-orders')).toBeVisible({ timeout: 60_000 });

	/**
	 * Land the probe in the FIRST rendered rows: put the grid on `date_created_gmt`
	 * DESC, where a just-created order sorts first under both the server's ordering
	 * and the renderer's local comparator (ISO date strings compare identically
	 * either way — no products-spec collation trap here).
	 *
	 * Sort steering happens BEFORE the scope pills are cleared, and the ordering is
	 * load-bearing: each sort change re-keys the orders browse lane and seeds a new
	 * wire walk (sort is part of the demand dimensions even though the fetcher puts
	 * no `orderby` on the URL), and a walk still in flight at probe-creation time
	 * could fetch the new order directly — a pass that says nothing about the
	 * change-signal path this spec exists to prove. Steered while the grid is still
	 * cashier+store-scoped, those walks carry `pos_cashier`/`pos_store` and CANNOT
	 * contain the scope-free probe; the only lane that can — the unscoped one — is
	 * seeded last by the pill-clears and its response is awaited before creation.
	 *
	 * The click path is deterministic from ANY persisted sort: a click on an
	 * unsorted column always selects ascending and a click on the sorted column
	 * flips it (header.tsx). The sacrificial `number` click asserts EITHER
	 * direction — if the persisted sort was already `number`, the click flips it,
	 * and either way the goal is only "date is no longer the sorted column", which
	 * makes the next date click deterministically ascending. Each click is
	 * confirmed via the header's sort-state testID before the next — for orders the
	 * DOM signal is the only confirmation there is, and unconfirmed rapid clicks
	 * could race the re-render and read stale sort state.
	 */
	await screen.getByTestId('data-table-header-number').first().click();
	await expect(screen.getByTestId(/^data-table-sort-number-(asc|desc)$/).first()).toBeVisible({
		timeout: 15_000,
	});
	await screen.getByTestId('data-table-header-date_created_gmt').first().click();
	await expect(screen.getByTestId('data-table-sort-date_created_gmt-asc').first()).toBeVisible({
		timeout: 15_000,
	});
	await screen.getByTestId('data-table-header-date_created_gmt').first().click();
	await expect(screen.getByTestId('data-table-sort-date_created_gmt-desc').first()).toBeVisible({
		timeout: 15_000,
	});

	// The unscoped browse the pill-clears must reissue. Scoped browses carry
	// pos_cashier/pos_store (rx-scheduler-order-fetcher.ts), the maintenance and
	// POS open-orders lanes always carry `status`, and change-signal pulls carry
	// `include` — absence of all of them identifies the grid's own unscoped browse.
	const unscopedBrowsePending = page.waitForResponse(
		(response) => {
			if (response.request().method() !== 'GET') return false;
			const url = new URL(response.url());
			const route = url.searchParams.get('rest_route');
			const isOrdersBrowse =
				url.pathname.endsWith('/wp-json/wcpos/v2/orders') || route === '/wcpos/v2/orders';
			return (
				isOrdersBrowse &&
				!url.searchParams.has('pos_cashier') &&
				!url.searchParams.has('pos_store') &&
				!url.searchParams.has('created_via') &&
				!url.searchParams.has('status') &&
				!url.searchParams.has('search') &&
				!url.searchParams.has('include')
			);
		},
		{ timeout: 60_000 }
	);
	unscopedBrowsePending.catch(() => {});
	await screen.getByTestId('order-filter-cashier-remove').click();
	await screen.getByTestId('order-filter-store-remove').click();
	const unscopedBrowse = await unscopedBrowsePending;
	if (!unscopedBrowse.ok()) {
		throw new Error(`Unscoped orders browse failed: HTTP ${unscopedBrowse.status()}`);
	}

	// An EMPTY unscoped grid is a legitimate starting state (a store with no web
	// orders yet) — unlike the products spec there is no skip here, because the
	// probe itself provides the row the assertion needs.
	await expect
		.poll(
			async () => {
				const hasOrders = await screen
					.getByTestId('data-table-count')
					.isVisible()
					.catch(() => false);
				const noOrders = await screen
					.getByTestId('no-data-message')
					.isVisible()
					.catch(() => false);
				return hasOrders || noOrders;
			},
			{ timeout: 30_000 }
		)
		.toBeTruthy();

	const token = mintSearchProbeToken(testInfo.workerIndex);
	const created = await createOrderArrivalProbe({
		request,
		storeUrl,
		authorization,
		token,
		writerConfigured: Boolean(writer),
	});
	if (!created.ok) {
		test.skip(true, created.reason);
		return;
	}

	// Setup is provably complete — grant the full arrival window on top of whatever
	// setup actually cost (TIMEOUT ARITHMETIC above).
	test.setTimeout(testInfo.timeout + ARRIVAL_GRANT_MS);

	try {
		const numberCell = screen.getByTestId('order-number').filter({
			hasText: exactCellText(created.number),
		});
		await expect(
			numberCell.first(),
			'an order created on the server must reach the orders grid without a search or manual sync'
		).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
	} finally {
		await deleteSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'orders',
			id: created.id,
		});
	}
});

/**
 * Directional coverage for CUSTOMERS (#1321). The audit found no shared descriptor
 * key between the customers trickle lane and the grid's demand browse — but that is
 * the same kind of reading that missed the coupon bug, so the guard is the same
 * empirical contract: a customer registered on the SERVER must surface in the
 * Customers grid without a search and without a manual sync.
 *
 * Sort steering follows the products spec's method, but lands on last_name
 * DESCENDING (see the in-body comment for why ascending would be wrong here), and
 * the probe's last name sorts first under BOTH the server's collation and the
 * renderer's code-unit comparator (see ARRIVAL_PROBE_LEAD). Customers sorts DO
 * reach the wire — `orderby=last_name` via the plugin's #1488 proxy seam — so the
 * steering click is also what proves the sorted browse demand reaches the server.
 *
 * The arrival anchor filters testID-addressed rows by the probe's unique token —
 * customer rows, like orders, key their testID on a client-side uuid that cannot be
 * known in advance, and the token (rendered in the First Name and Email columns) is
 * record DATA, not the localized UI copy the selector policy guards against.
 */
test('a customer created on the server reaches the customers grid without a search', async ({
	posPage: page,
	request,
	storeAuthorization,
}, testInfo) => {
	// The Customers page is a Pro-only drawer screen — on free there is no grid.
	test.skip(getStoreVariant(testInfo) !== 'pro', 'Customers page requires Pro');

	const storeUrl = getStoreUrl(testInfo);
	const writer = await productWriterAuthorization(request, storeUrl);
	const authorization = writer ?? storeAuthorization();

	await navigateToPage(page, 'customers');
	const screen = page.getByTestId('screen-customers').filter({ visible: true });
	await expect(screen.getByTestId('search-customers')).toBeVisible({ timeout: 60_000 });

	const customersBrowseResponse = (orderby: string, order: string) =>
		page.waitForResponse(
			(response) => {
				if (response.request().method() !== 'GET') return false;
				const url = new URL(response.url());
				const route = url.searchParams.get('rest_route');
				const isCustomersBrowse =
					url.pathname.endsWith('/wp-json/wcpos/v2/customers') || route === '/wcpos/v2/customers';
				return (
					isCustomersBrowse &&
					url.searchParams.get('orderby') === orderby &&
					url.searchParams.get('order') === order &&
					!url.searchParams.has('search') &&
					!url.searchParams.has('include')
				);
			},
			{ timeout: 60_000 }
		);

	/**
	 * Steer to last_name DESCENDING — the direction is load-bearing, not stylistic.
	 * Customers with an EMPTY last name are common (admin and subscriber accounts),
	 * '' sorts before every possible probe lead under ascending code-unit order, and
	 * enough of them would hold the probe out of the first rendered rows for a
	 * reason that has nothing to do with arrival. Under descending they sort LAST,
	 * and the 'zzzz' lead outranks every letter under both the server's collation
	 * and the renderer's comparator (see ARRIVAL_PROBE_LEAD).
	 *
	 * The click path is the deterministic one from ANY starting sort (a click on an
	 * unsorted column always selects ascending, a click on the sorted column flips
	 * it — header.tsx): email → asc(last_name) → desc(last_name). Each click is
	 * confirmed via the header's sort-state testID before the next, so a rapid
	 * second click can never read stale sort state.
	 */
	// The sacrificial email click asserts EITHER direction: if the persisted sort
	// was already `email`, the click flips it, and either way the goal is only
	// "last_name is no longer the sorted column".
	await screen.getByTestId('data-table-header-email').first().click();
	await expect(screen.getByTestId(/^data-table-sort-email-(asc|desc)$/).first()).toBeVisible({
		timeout: 15_000,
	});
	await screen.getByTestId('data-table-header-last_name').first().click();
	await expect(screen.getByTestId('data-table-sort-last_name-asc').first()).toBeVisible({
		timeout: 15_000,
	});
	const sortedBrowsePending = customersBrowseResponse('last_name', 'desc');
	sortedBrowsePending.catch(() => {});
	await screen.getByTestId('data-table-header-last_name').first().click();
	await expect(screen.getByTestId('data-table-sort-last_name-desc').first()).toBeVisible({
		timeout: 15_000,
	});
	const sortedBrowse = await sortedBrowsePending;
	if (!sortedBrowse.ok()) {
		throw new Error(`Customers last-name browse failed: HTTP ${sortedBrowse.status()}`);
	}
	// The raw wire body is B9-enveloped ({ data, _wcpos }) — response.json() reads the wire.
	const sortedBody = unwrapWireBody(await sortedBrowse.json().catch(() => null));
	if (!Array.isArray(sortedBody)) {
		throw new Error('Customers last-name browse returned a malformed customer list');
	}
	// Anchor on the RENDERED grid, never on the wire body's ordering (see the
	// products spec above for why the two disagree). An empty store needs no
	// anchor — the probe itself provides the first row.
	if (sortedBody.length > 0) {
		await expect(screen.getByTestId(/^data-table-row-/).first()).toBeVisible({
			timeout: 30_000,
		});
	}

	// Land the probe in the first rendered rows under the applied sort: the lead
	// token sorts first under both the server's collation and the renderer's
	// code-unit comparator — see ARRIVAL_PROBE_LEAD.
	const token = mintSearchProbeToken(testInfo.workerIndex);
	const created = await createSearchProbe({
		request,
		storeUrl,
		authorization,
		collection: 'customers',
		workerIndex: testInfo.workerIndex,
		token,
		customerData: {
			// Timestamp BEFORE the token: some stores accept the customer create but
			// 403 the delete (wc/v3 customer deletion needs user-deletion caps the
			// writer may not hold), so orphaned probes accumulate. All probes share
			// the 'zzzz' lead, so among them the descending sort is decided at the
			// next field — a base36 timestamp guarantees the NEWEST probe sorts first
			// under both orderings, where the raw token would let an older probe from
			// a higher worker index outrank it and push it off the rendered window.
			last_name: `${ARRIVAL_PROBE_LEAD.desc} ${Date.now().toString(36)} Arrival ${token}`,
		},
	});
	if (!created.ok) {
		// Elevated writer credentials are a DECLARED capability: with them in play a
		// failed create is a failure, never a skip (store-agnostic E2E policy).
		if (writer) throw new Error(created.reason);
		test.skip(true, created.reason);
		return;
	}

	// Setup is provably complete — grant the full arrival window on top of whatever
	// setup actually cost (TIMEOUT ARITHMETIC above).
	test.setTimeout(testInfo.timeout + ARRIVAL_GRANT_MS);

	try {
		const probeRow = screen.getByTestId(/^data-table-row-/).filter({ hasText: token });
		await expect(
			probeRow.first(),
			'a customer created on the server must reach the customers grid without a search or manual sync'
		).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
	} finally {
		await deleteSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'customers',
			id: created.probe.id,
		});
	}
});
