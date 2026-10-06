import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The products stage under a Browse by source (roadmap#392) opens on its term set, not the
 * products: `BrowseRootGrid` and `BrowseRootTable` render neither the products grid's scroller
 * nor the table's header or scroller, so the indicators below would read a browse root as
 * "neither view". The root carries `browse-root` in both views and `browse-root-rows` (the
 * table card) only in table view, so the view is told from that pair.
 */
function browseRootTable(page: Page): Locator {
	return page.getByTestId('browse-root-rows').first();
}
function browseRootGrid(page: Page): Locator {
	return page
		.getByTestId('browse-root')
		.filter({ hasNot: page.getByTestId('browse-root-rows') })
		.first();
}

/**
 * Ensure the POS products list is in table view (not grid view).
 *
 * The variation popover button and the expand link only render in table view, and the default
 * mode differs between environments and persisted settings — so every suite that touches
 * variation rows has to establish it rather than assume it.
 */
export async function ensureTableView(page: Page) {
	const toggle = page.getByTestId('view-mode-toggle');
	const tableHeader = page.getByTestId('data-table-header-name').first();
	const variablePopoverButton = page.getByTestId('variable-product-popover-button').first();
	// The v2 table renders no sortable header on a coarse pointer and no popover button under
	// the drill-in style; its list root is the one indicator every rendering shares.
	const tableScroller = page.getByTestId('data-table-scroller-products').first();
	const browseRoot = browseRootTable(page);

	// Check if table indicators are already present (wait up to 2s for visibility).
	// Note: isVisible({ timeout }) is deprecated in Playwright v1.40+ and silently ignores timeout.
	// Use waitFor for actual waiting behavior.
	const isTableView = await (async () => {
		try {
			await variablePopoverButton.waitFor({ state: 'visible', timeout: 2_000 });
			return true;
		} catch {
			try {
				await tableHeader.waitFor({ state: 'visible', timeout: 500 });
				return true;
			} catch {
				try {
					await tableScroller.or(browseRoot).first().waitFor({ state: 'visible', timeout: 500 });
					return true;
				} catch {
					return false;
				}
			}
		}
	})();
	if (isTableView) {
		return;
	}

	await expect(toggle).toBeVisible({ timeout: 15_000 });
	await toggle.click();

	// Wait until table indicators appear after toggling from grid.
	await expect
		.poll(
			async () =>
				(await tableHeader.isVisible().catch(() => false)) ||
				(await variablePopoverButton.isVisible().catch(() => false)) ||
				(await tableScroller.isVisible().catch(() => false)) ||
				(await browseRoot.isVisible().catch(() => false)),
			{ timeout: 15_000 }
		)
		.toBeTruthy();
}

/**
 * Ensure the POS products list is in GRID view — the shipped default (`viewMode: "grid"` in
 * initial-settings.json) and the surface the variable-product TILE lives on. The tile is its own
 * popover trigger, distinct from the table row's chevron button.
 */
export async function ensureGridView(page: Page) {
	const toggle = page.getByTestId('view-mode-toggle');
	// The products grid's scroller, or a browse root with no table card under it.
	const gridIndicator = page
		.getByTestId('pos-products-grid-scroller')
		.or(browseRootGrid(page))
		.first();

	// `isVisible()` samples, it does not wait (it is documented as returning immediately). On a
	// grid that has not painted yet that sample reads false, this helper "corrects" a view that
	// was already right, and the toggle lands the test in TABLE view — the opposite of what it
	// was asked for. `waitFor` is the waiting form; the same reasoning is why ensureTableView
	// above is written this way.
	const alreadyGrid = await gridIndicator
		.waitFor({ state: 'visible', timeout: 2_000 })
		.then(() => true)
		.catch(() => false);
	if (alreadyGrid) {
		return;
	}

	await expect(toggle).toBeVisible({ timeout: 15_000 });
	await toggle.click();
	await expect(gridIndicator).toBeVisible({ timeout: 15_000 });
}
