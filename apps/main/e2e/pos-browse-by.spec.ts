import { expect, type Locator, type Page } from '@playwright/test';

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
	sweepOrphanedProbeCategories,
} from './search-probe';

/**
 * Browse by categories against a real store (roadmap#392, slice 4).
 *
 * Store-agnostic throughout (CLAUDE.md, E2E store-agnostic policy): the spec creates a
 * disposable ROOT category under the writer credentials and a probe product in it, so a clean
 * CI store has coverage and no existing category, product or count is ever assumed. In BOTH
 * views it proves the whole pipeline: the root term set shows the new category (a wire pull of
 * the taxonomy on the stage's own demand), All products opens as a level and comes back,
 * opening the category shows the probe under its crumb (the level's filtered query), the crumb
 * goes back, and a search typed at the root spans the catalogue and gives the root back on clear.
 *
 * The writer credentials are a declared capability: absent, the spec skips with that reason
 * (at collection, before the costly login); present and failing, it fails.
 */

/**
 * How a categories stage learns about a category created after the app booted — traced, since
 * the spec's whole first assertion rests on it:
 *
 *  - Mounting the stage declares the taxonomy binding's demand (`useEngineBinding`'s standing
 *    declaration, `packages/core/src/query/query-bindings.ts` 273–400, `declare(true)`); for
 *    `products/categories` that demand is one `kind: 'refresh'` requirement
 *    (`query-state-translator.ts` 648–668).
 *  - The require plane runs that refresh as an on-demand reference pull
 *    (`packages/sync-engine/src/require-plane.ts` 1101–1150) and dedupes it ONLY against its
 *    own last demand pull, in memory, inside `REFERENCE_DEMAND_REFRESH_DEDUPE_MS` (15 s,
 *    `maintenance/maintenance-lanes.ts` 128); the seed is passed `completedDedupeForMs: 0`, so
 *    neither met coverage nor the idle lane's 4-minute window suppresses it.
 *
 * So a REMOUNT more than 15 s after the previous demand pull forces a fresh wire pull; inside
 * that window it is served local, and the next wire read is the idle lane's (30 min), which no
 * spec can wait for. A stage already mounted at boot under a leftover `categories` setting
 * pulled BEFORE the category existed: the spec therefore parks the setting on `all` first and
 * mounts the stage afresh after the category is made, and keeps that mount at least the dedupe
 * window away from boot.
 */
const DEMAND_DEDUPE_WINDOW_MS = 15_000;
/** The taxonomy pull the stage declares on mount has to reach the wire and come back. */
const TERM_PULL_TIMEOUT_MS = 45_000;
/** A level's products are a filtered window: a sync budget, as the category filter spec's. */
const LEVEL_PRODUCTS_TIMEOUT_MS = 30_000;

/** The probe's id-bearing tile or row, whichever view is on: `product-tile-<id>` / `data-table-row-<slug>`. */
function probeLocator(page: Page, probe: SearchProbe) {
	const tile = page.getByTestId(`product-tile-${probe.id}`);
	return probe.rowTestId ? tile.or(page.getByTestId(probe.rowTestId)) : tile;
}

/**
 * The root term set is virtualized: a term past the first screen is not in the DOM. The probe
 * category's name sorts first on most stores (`PROBE_CATEGORY_LEAD`), but a store whose root
 * names begin with punctuation, whitespace or an emoji sorts those before it, so the root is
 * scrolled until the id-bearing term is mounted rather than trusting the prefix (store-agnostic
 * policy). The pull itself can still be in flight, so the loop runs on the pull's budget.
 */
async function scrollRootUntilMounted(page: Page, root: Locator, term: Locator): Promise<void> {
	await expect(root).toBeVisible();
	const deadline = Date.now() + TERM_PULL_TIMEOUT_MS;
	// Sweeps, not a one-way scroll: the pull can still be in flight, and a term it inserts near
	// the top after the sweep has reached the bottom is only found by going back up. Each pass
	// walks down a screen at a time and then returns to the top before the next.
	let step = 0;
	while (!(await term.isVisible().catch(() => false))) {
		if (Date.now() > deadline) break;
		const box = await root.boundingBox();
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			const page_ = Math.max(200, box.height * 0.8);
			// Four screens down, then one jump back to the top (a wheel delta no root exceeds).
			await page.mouse.wheel(0, step % 5 === 4 ? -page_ * 50 : page_);
		}
		step++;
		await page.waitForTimeout(250);
	}
	await expect(term).toBeVisible({ timeout: TERM_PULL_TIMEOUT_MS });
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
		// The page booted inside the fixture; this is the latest a boot-time taxonomy pull can be.
		const bootedAt = Date.now();
		const storeUrl = getStoreUrl(testInfo);
		const authorization = await productWriterAuthorization(request, storeUrl);
		if (!authorization) {
			throw new Error('Configured product-writer credentials did not produce authorization');
		}
		await sweepOrphanedProbeCategories({ request, storeUrl, authorization });
		// Park the setting on `all` BEFORE the category exists, so no categories stage is up to
		// have pulled the taxonomy without it (see DEMAND_DEDUPE_WINDOW_MS).
		await ensureRegisterOpen(page);
		await setBrowseBy(page, 'all');

		const token = mintSearchProbeToken(testInfo.workerIndex);
		const category = await createProbeCategory({ request, storeUrl, authorization, token });
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

			const screen = page.getByTestId('screen-pos');
			const search = screen.getByTestId('search-products');
			const clear = screen.getByTestId('search-products-clear');
			// The store has the probe, and the till has rendered it once: the helper returns on the
			// server's answer OR a local hit, so the explicit wait after it is what makes the tile
			// (or row) resident before the browse starts.
			await searchAndWaitForServer(page, search, 'products', token, probeLocator(page, probe));
			await expect(probeLocator(page, probe)).toBeVisible({ timeout: LEVEL_PRODUCTS_TIMEOUT_MS });
			await clear.click();
			// The search is what has to be gone before the browse starts, not the probe: on a small
			// catalogue, or whenever the probe sorts into the first page, it stays on screen with
			// the search cleared, and that is correct behaviour.
			await expect(search).toHaveValue('', { timeout: LEVEL_PRODUCTS_TIMEOUT_MS });
			// Usually already elapsed; a fast store is the one case this waits for.
			const sinceBoot = Date.now() - bootedAt;
			if (sinceBoot < DEMAND_DEDUPE_WINDOW_MS) {
				await page.waitForTimeout(DEMAND_DEDUPE_WINDOW_MS - sinceBoot);
			}

			const root = page.getByTestId('browse-root');
			const allProducts = page.getByTestId('browse-all-products');
			const term = page.getByTestId(`browse-term-${category.id}`);
			const crumb = page.getByTestId('products-breadcrumb');
			const back = page.getByTestId('products-breadcrumb-back');
			for (const ensureView of [ensureGridView, ensureTableView]) {
				// Each view's stage mounts fresh: the view is set on the products (`all`), and the
				// categories stage then mounts in that view with a pull of its own.
				await setBrowseBy(page, 'all');
				await ensureView(page);
				await setBrowseBy(page, 'categories');
				await expect(root).toBeVisible({ timeout: TERM_PULL_TIMEOUT_MS });
				await expect(allProducts).toBeVisible();
				await scrollRootUntilMounted(page, root, term);
				// All products is a level of its own: the whole catalogue under its crumb, and back.
				await allProducts.click();
				await expect(crumb).toBeVisible();
				await expect(root).toBeHidden();
				await back.click();
				await expect(root).toBeVisible();
				// The category: its products under its crumb, the probe among them.
				await scrollRootUntilMounted(page, root, term);
				await term.click();
				await expect(crumb).toBeVisible();
				await expect(probeLocator(page, probe)).toBeVisible({ timeout: LEVEL_PRODUCTS_TIMEOUT_MS });
				await back.click();
				await expect(root).toBeVisible();
				// A search at the root spans the catalogue: the term set steps aside for the results.
				await search.fill(probe.token);
				await expect(root).toBeHidden();
				await expect(probeLocator(page, probe)).toBeVisible({ timeout: LEVEL_PRODUCTS_TIMEOUT_MS });
				await clear.click();
				await expect(root).toBeVisible();
			}
		} finally {
			// Three independent best-effort cleanups, the API deletes FIRST: a hung dialog must not
			// keep the probe alive, and a probe that would not delete must not keep the category.
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
			// Back to the till's default.
			await setBrowseBy(page, 'categories').catch(() => undefined);
		}
	});
});
