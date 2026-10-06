import { expect, type Page } from '@playwright/test';

import {
	ensureRegisterOpen,
	getStoreUrl,
	setBrowseBy,
	authenticatedTest as test,
} from './fixtures';
import { ensureGridView, ensureTableView } from './pos-view-mode';
import {
	createProbeCategory,
	createSearchProbe,
	deleteProbeCategory,
	deleteSearchProbe,
	mintSearchProbeToken,
	productWriterAuthorization,
	productWriterCredentialsConfigured,
	searchAndWaitForServer,
	type SearchProbe,
} from './search-probe';

/**
 * Browse by categories against a real store (roadmap#392, slice 4).
 *
 * Store-agnostic throughout (CLAUDE.md, E2E store-agnostic policy): the spec creates a
 * disposable ROOT category under the writer credentials and a probe product in it, so a clean
 * CI store has coverage and no existing category, product or count is ever assumed. In BOTH
 * views it proves the whole pipeline: the root term set shows the new category (a wire pull of
 * the taxonomy on the stage's own demand), opening it shows the probe under its crumb (the
 * level's filtered query), the crumb goes back, and a search typed at the root spans the
 * catalogue and gives the root back on clear.
 *
 * The writer credentials are a declared capability: absent, the spec skips with that reason
 * (at collection, before the costly login); present and failing, it fails.
 */

/**
 * The root set is ordered by `menu_order` then name and virtualized, so a term that sorts past
 * the first screen is not in the DOM to be found. A lead that sorts before any letter or digit
 * puts the probe category beside All products on every store; the token keeps it unique.
 */
const CATEGORY_LEAD = '0000 E2E Browse';
/** The taxonomy pull the stage declares on mount has to reach the wire and come back. */
const TERM_PULL_TIMEOUT_MS = 45_000;
/** A level's products are a filtered window: a sync budget, as the category filter spec's. */
const LEVEL_PRODUCTS_TIMEOUT_MS = 30_000;

/** The probe's id-bearing tile or row, whichever view is on: `product-tile-<id>` / `data-table-row-<slug>`. */
function probeLocator(page: Page, probe: SearchProbe) {
	const tile = page.getByTestId(`product-tile-${probe.id}`);
	return probe.rowTestId ? tile.or(page.getByTestId(probe.rowTestId)) : tile;
}

test.describe('Browse by categories', () => {
	test.skip(
		!productWriterCredentialsConfigured(),
		'E2E_PRODUCT_WRITER_USER/_PASS not configured — the categories-first drill needs a category and a product the spec created'
	);

	test('categories first: the root shows the category, drilling in shows the probe, the crumb goes back, search spans everything', async ({
		posPage: page,
		request,
	}, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const authorization = await productWriterAuthorization(request, storeUrl);
		if (!authorization) {
			throw new Error('Configured product-writer credentials did not produce authorization');
		}
		const token = mintSearchProbeToken(testInfo.workerIndex);
		const category = await createProbeCategory({
			request,
			storeUrl,
			authorization,
			name: `${CATEGORY_LEAD} ${token}`,
		});
		// Everything after the category exists runs inside the cleanup scope: a failure creating
		// the probe, in the server wait or in the register setup must still delete what was made.
		let probe: SearchProbe | undefined;
		try {
			const created = await createSearchProbe({
				request,
				storeUrl,
				authorization,
				collection: 'products',
				workerIndex: testInfo.workerIndex,
				token,
				writerConfigured: true,
				// In stock and unmanaged: the membership must survive showOutOfStock = false.
				productData: {
					categories: [{ id: category.id }],
					manage_stock: false,
					stock_status: 'instock',
				},
			});
			if (!created.ok) throw new Error(created.reason);
			probe = created.probe;

			await ensureRegisterOpen(page);
			const search = page.getByTestId('screen-pos').getByTestId('search-products');
			const clear = page.getByTestId('search-products-clear');
			// The probe is resident before the browse starts: a level's products come from the
			// local replica, and the search is also what proves the store has it.
			await searchAndWaitForServer(page, search, 'products', token, probeLocator(page, probe));
			await clear.click();
			// `all` first, whatever a leftover setting says: the categories stage then MOUNTS below,
			// and a mount is the demand that pulls the taxonomy from the wire (a stage already up
			// since boot would have pulled before the category existed).
			await setBrowseBy(page, 'all');
			await setBrowseBy(page, 'categories');

			const root = page.getByTestId('browse-root');
			const term = page.getByTestId(`browse-term-${category.id}`);
			for (const ensureView of [ensureGridView, ensureTableView]) {
				await ensureView(page);
				await expect(root).toBeVisible({ timeout: TERM_PULL_TIMEOUT_MS });
				await expect(page.getByTestId('browse-all-products')).toBeVisible();
				await expect(term).toBeVisible({ timeout: TERM_PULL_TIMEOUT_MS });
				await term.click();
				await expect(page.getByTestId('products-breadcrumb')).toBeVisible();
				await expect(probeLocator(page, probe)).toBeVisible({ timeout: LEVEL_PRODUCTS_TIMEOUT_MS });
				await page.getByTestId('products-breadcrumb-back').click();
				await expect(root).toBeVisible();
				// A search at the root spans the catalogue: the term set steps aside for the results.
				await search.fill(probe.token);
				await expect(root).toBeHidden();
				await expect(probeLocator(page, probe)).toBeVisible({ timeout: LEVEL_PRODUCTS_TIMEOUT_MS });
				await clear.click();
				await expect(root).toBeVisible();
			}
		} finally {
			// Three independent best-effort cleanups: a broken dialog must not keep the probe alive,
			// and a probe that would not delete must not keep the category.
			await setBrowseBy(page, 'all').catch(() => undefined);
			if (probe) {
				await deleteSearchProbe({
					request,
					storeUrl,
					authorization,
					collection: 'products',
					id: probe.id,
				}).catch(() => undefined);
			}
			await deleteProbeCategory({ request, storeUrl, authorization, id: category.id }).catch(
				() => undefined
			);
		}
	});
});
