import { expect, test } from '@playwright/test';

import {
	authenticateWithStore,
	captureStoreAuthorization,
	getStoreUrl,
	navigateToPage,
	storeRequestOptions,
} from './fixtures';

/**
 * pro#425 — the till must DISPLAY its own store's price.
 *
 * The one assertion the phpunit suites and the scripted HTTP proof could not
 * make. Those set the store header by hand and checked the SERVER honoured it;
 * this is the only check that the real client puts the scope on the wire and
 * renders what comes back.
 *
 * Not in the CI matrix — `.live.spec.ts`, run by hand, because it needs a
 * product that is per-store-priced, which CI has no business assuming.
 *
 * Provision the probe with `scripts/pro425-fixture.php` (see the PR body).
 *
 * Store-agnostic by construction: it never assumes WHICH store the app scopes
 * to and never hardcodes a price. It reads the scope off the app's own
 * requests, asks the server what that scope should see, and asserts the grid
 * agrees — skipping with a reason if that store has no per-store override,
 * because then there is nothing to distinguish.
 *
 * Run:
 *   BASE_URL=https://current-preview.example E2E_PRODUCT_WRITER_PASS=… npx playwright test -c playwright.pro425.config.ts
 *
 * PRO425_USER / PRO425_PASS override the identity when the Actions secret is
 * not to hand locally — any shop_manager with POS access will do.
 */

const PROBE_SLUG = process.env.PRO425_SLUG || 'pro425probe';

// Defaults to the shared `e2e-product-writer` identity, which exists on every
// dev server under the same well-known username with credentials already in
// Actions secrets. A CASHIER works equally well: the cashier role carries
// edit_products on next (Activator::create_pos_roles), and this spec has been
// run green as `demo`. Note a stale dev server may disagree — role capabilities
// are only re-synced on a VERSION BUMP, which dev deploys never do.
const MANAGER_USER =
	process.env.PRO425_USER || process.env.E2E_PRODUCT_WRITER_USER || 'e2e-product-writer';
const MANAGER_PASS = process.env.PRO425_PASS || process.env.E2E_PRODUCT_WRITER_PASS;

/** `25,00` and `25.00` are the same money; the store picks the separator. */
function normalizeMoney(text: string): string {
	return text.replace(/(\d),(\d)/g, '$1.$2');
}

test.describe('pro#425 — store-scoped pricing in the till', () => {
	test.skip(
		!MANAGER_PASS,
		'no writer password set — export E2E_PRODUCT_WRITER_PASS or PRO425_PASS'
	);

	test('the products grid renders the STORE price, not the global one', async ({
		page,
		request,
	}, testInfo) => {
		const getAuthorization = captureStoreAuthorization(page);

		// The scope the app itself puts on the wire — the thing under test.
		const scopes = new Set<string>();
		page.on('request', (req) => {
			if (!req.url().includes('/wcpos/v2/products')) return;
			const store = req.headers()['x-wcpos-store'];
			if (store) scopes.add(store);
		});

		await authenticateWithStore(page, testInfo, {
			waitForCatalogue: true,
			credentials: { username: MANAGER_USER, password: MANAGER_PASS as string },
		});

		await navigateToPage(page, 'products');
		const products = page.getByTestId('screen-products').filter({ visible: true });
		await expect(products.getByTestId('search-products')).toBeVisible({ timeout: 60_000 });
		await products.getByTestId('search-products').fill(PROBE_SLUG);

		// The probe is a PREREQUISITE, not a failure mode: an unprovisioned server is
		// declared-missing environment, which the repo policy says must skip with a
		// reason naming what is absent. Waiting out the full 60s and failing on an
		// invisible row would report "product defect" for "you did not run the
		// fixture" — the exact confusion this spec exists to avoid.
		const row = products.getByTestId(`data-table-row-${PROBE_SLUG}`);
		const probeRendered = await row
			.waitFor({ state: 'visible', timeout: 60_000 })
			.then(() => true)
			.catch(() => false);
		test.skip(
			!probeRendered,
			`probe product "${PROBE_SLUG}" is not in this store's catalogue — provision it with e2e/scripts/pro425-fixture.php`
		);

		// FIRST: the client must have sent a store scope at all. Before this fix
		// the v2 lane carried none, which is the root cause of pro#425.
		expect(scopes.size, 'the app sent no X-WCPOS-Store on any products request').toBeGreaterThan(0);
		const scope = [...scopes][0];
		console.log(`[pro425] app scoped its catalogue reads to store ${scope}`);

		// Ask the server what THIS scope should see, and what the web store sees.
		const storeUrl = getStoreUrl(testInfo);
		const options = storeRequestOptions(getAuthorization());
		const read = async (headers: Record<string, string>) => {
			// Both permalink styles, per the repo's store-agnostic policy: a plain-
			// permalink store 404s the pretty /wp-json/ path even though the API is
			// healthy, which would read as a failure of the thing under test.
			const get = (url: string, extraParams: Record<string, string> = {}) =>
				request.get(url, {
					...options,
					headers: { ...options.headers, ...headers },
					params: { ...options.params, ...extraParams, search: PROBE_SLUG, per_page: '10' },
				});

			let res = await get(`${storeUrl}/wp-json/wcpos/v2/products`);
			if (res.status() === 404) {
				res = await get(`${storeUrl}/`, { rest_route: '/wcpos/v2/products' });
			}
			expect(res.ok(), `catalogue read failed: ${res.status()}`).toBeTruthy();
			const rows = (await res.json()) as { slug?: string; regular_price?: string }[];
			return rows.find((r) => r.slug === PROBE_SLUG)?.regular_price;
		};

		const scopedPrice = await read({ 'X-WCPOS-Store': scope });
		const globalPrice = await read({});
		console.log(`[pro425] server says: store ${scope} => ${scopedPrice}, global => ${globalPrice}`);

		expect(scopedPrice, `probe ${PROBE_SLUG} not found for store ${scope}`).toBeTruthy();
		test.skip(
			scopedPrice === globalPrice,
			`store ${scope} has no per-store price for ${PROBE_SLUG} (both ${globalPrice}) — nothing to distinguish`
		);

		const rendered = normalizeMoney(((await row.textContent()) ?? '').replace(/\s+/g, ' ').trim());
		console.log(`[pro425] rendered row: ${rendered}`);

		await page.screenshot({
			path: testInfo.outputPath('pro425-till-store-price.png'),
			fullPage: false,
		});

		// THE assertion: the grid shows this store's price, and not the web store's.
		//
		// Compared as whole MONEY TOKENS, never as substrings of the row text. A
		// substring check reports a defect on a correct render whenever one price
		// is contained in the other — scoped `25.00` against global `5.00` is the
		// obvious case, and `10.00` against a row rendering `110.00` the subtler
		// one. Both numbers come from the live server, so that collision is a
		// matter of which store you point at, not of whether the app is right.
		const amountsInRow = (rendered.match(/\d+[.,]\d{2}/g) ?? []).map((token) =>
			Number(normalizeMoney(token)).toFixed(2)
		);
		const asAmount = (value: string) => Number(normalizeMoney(value)).toFixed(2);

		expect(
			amountsInRow,
			`the till should show store ${scope}'s price (row rendered: ${rendered})`
		).toContain(asAmount(scopedPrice as string));
		expect(
			amountsInRow,
			`the till must not show the global web-store price (row rendered: ${rendered})`
		).not.toContain(asAmount(globalPrice as string));
	});
});
