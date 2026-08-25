import { expect, type Page } from '@playwright/test';

import { isolatedVariationMatrixTest as test, variationMatrixProbe } from './checkout-probe';
import { becomesVisible } from './fixtures';
import { ensureTableView } from './pos-view-mode';
import { searchAndWaitForServer } from './search-probe';

/**
 * The expanded variation rows follow the Stock Status pill.
 *
 * Reported 2026-08-25 against the demo store: with every filter cleared, expanding a 20-colour
 * product showed only its 4 in-stock variations, because the nested list read a persisted
 * display setting instead of the live filter (#1572).
 *
 * The companion spec (`pos-variation-popover-states.spec.ts`) asserts the popover answers the
 * same pill. Keeping both is the point — they are separate code paths that drifted apart once
 * already, and each was individually green while they disagreed.
 */

async function clearStockStatusPill(page: Page) {
	const remove = page.getByTestId('filter-pill-remove-stock_status');
	if (await becomesVisible(remove, 2_000)) {
		await remove.click();
	}
	// The remove affordance only renders while the filter is set, so its absence IS the cleared
	// state — assert it rather than trusting the click.
	await expect(remove).toHaveCount(0, { timeout: 10_000 });
}

async function setStockStatusPill(page: Page, value: 'instock' | 'outofstock' | 'onbackorder') {
	await page.getByTestId('filter-pill-stock_status').click();
	const option = page.getByTestId(`stock-status-option-${value}`);
	await expect(option).toBeVisible({ timeout: 10_000 });
	await option.click();
}

test.describe('POS expanded variations follow the Stock Status pill', () => {
	test.beforeEach(async ({ posPage: page }) => {
		const probe = variationMatrixProbe(page);
		test.skip(
			probe === null,
			'No product-writer credentials configured — cannot seed the variation matrix'
		);
		await ensureTableView(page);
		await searchAndWaitForServer(
			page,
			page.getByTestId('screen-pos').getByTestId('search-products'),
			'products',
			probe!.token,
			page.getByTestId(probe!.rowTestId!)
		);
		// Settings hydration can finish DURING the search and flip the panel back to grid, where
		// there are no table rows to expand — the existing variable-product helper re-establishes
		// the mode after results land for exactly this reason.
		await ensureTableView(page);
	});

	test('shows every variation when cleared and only the matching one when narrowed', async ({
		posPage: page,
	}) => {
		const probe = variationMatrixProbe(page)!;
		const row = (cell: string) =>
			page.getByTestId(`data-table-row-variation-${probe.variationIds[cell]}`);

		// Cleared: no rule at all, so all three variations are on show — one in stock, one out of
		// stock, one backordered. This is the reported bug: the filter bar said "no filter" and
		// the nested list hid rows anyway.
		await clearStockStatusPill(page);
		const expandLink = page.getByTestId(probe.rowTestId!).getByTestId('variable-product-expand');
		await expect(expandLink).toBeVisible({ timeout: 15_000 });
		await expandLink.click();

		await expect(row('Red/Small')).toBeVisible({ timeout: 30_000 });
		await expect(row('Red/Large')).toBeVisible({ timeout: 30_000 });
		await expect(row('Blue/Small')).toBeVisible({ timeout: 30_000 });

		// Narrowed to In stock: only Red/Small qualifies. Out of stock leaves, and so does
		// BACKORDERED — sellable, but not in stock. Watching rows disappear is what separates
		// "the filter is applied" from "the filter is ignored"; the cleared case cannot.
		await setStockStatusPill(page, 'instock');
		await expect(row('Red/Small')).toBeVisible({ timeout: 30_000 });
		await expect(row('Red/Large')).toHaveCount(0, { timeout: 30_000 });
		await expect(row('Blue/Small')).toHaveCount(0, { timeout: 30_000 });
	});
});
