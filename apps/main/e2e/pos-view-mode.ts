import { expect, type Page } from '@playwright/test';

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
				return false;
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
				(await variablePopoverButton.isVisible().catch(() => false)),
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
	const gridScroller = page.getByTestId('pos-products-grid-scroller');

	// `isVisible()` samples, it does not wait (it is documented as returning immediately). On a
	// grid that has not painted yet that sample reads false, this helper "corrects" a view that
	// was already right, and the toggle lands the test in TABLE view — the opposite of what it
	// was asked for. `waitFor` is the waiting form; the same reasoning is why ensureTableView
	// above is written this way.
	const alreadyGrid = await gridScroller
		.waitFor({ state: 'visible', timeout: 2_000 })
		.then(() => true)
		.catch(() => false);
	if (alreadyGrid) {
		return;
	}

	await expect(toggle).toBeVisible({ timeout: 15_000 });
	await toggle.click();
	await expect(gridScroller).toBeVisible({ timeout: 15_000 });
}
