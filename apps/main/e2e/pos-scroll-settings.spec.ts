import { expect } from '@playwright/test';

import { navigateToPage, authenticatedTest as test } from './fixtures';

/**
 * Regression: navigating POS → Settings → POS must not move the products
 * scroll position or trigger a phantom page-load.
 *
 * On web, blurred navigation screens stay mounted under display:none. That
 * used to (a) poison the virtualizer's item-size cache with 0px measurements,
 * whose re-measure on return cascaded the scroll offset toward the bottom,
 * and (b) collapse the scroll container to 0x0 so onEndReached fired and
 * fetched another page while the user was on the Settings screen.
 */
test('POS products scroll position survives a Settings round-trip', async ({ posPage: page }) => {
	// Products list scroller — grid or table mode, whichever this store shows.
	const scroller = page
		.locator(
			'[data-testid="pos-products-grid-scroller"], [data-testid="data-table-scroller-products"]'
		)
		.filter({ visible: true })
		.first();

	const hasRows = await scroller.isVisible().catch(() => false);
	if (!hasRows) {
		test.skip(true, 'No products rendered in this store scope — nothing to scroll');
		return;
	}

	// Let the initial page of products settle before sampling.
	await page.waitForTimeout(2000);
	const before = await scroller.evaluate((el) => ({
		scrollTop: el.scrollTop,
		scrollHeight: el.scrollHeight,
	}));
	const countBefore = await page
		.locator('[data-testid="data-table-count"]')
		.filter({ visible: true })
		.first()
		.textContent()
		.catch(() => null);

	// POS → Settings (drawer page on next; POS stays mounted, display:none).
	await page.getByTestId('user-menu-trigger').click();
	await page.getByTestId('settings-menu-item').click();
	await expect(page.getByTestId('screen-settings-general')).toBeVisible({ timeout: 10_000 });

	// Dwell long enough for a hidden-measure cascade / phantom fetch to fire.
	await page.waitForTimeout(3000);

	// Settings → POS.
	await navigateToPage(page, 'pos');
	await expect(page.getByTestId('search-products')).toBeVisible({ timeout: 10_000 });
	await page.waitForTimeout(2000);

	const after = await scroller.evaluate((el) => ({
		scrollTop: el.scrollTop,
		scrollHeight: el.scrollHeight,
	}));
	const countAfter = await page
		.locator('[data-testid="data-table-count"]')
		.filter({ visible: true })
		.first()
		.textContent()
		.catch(() => null);

	// The exact reported symptom: scroll landed near the bottom after the
	// round-trip. Allow sub-row jitter but nothing resembling a jump.
	expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThan(50);

	// The hidden pane must not have loaded another page ("Showing X of Y"
	// stays whatever it was — relative comparison, no absolute counts).
	if (countBefore !== null) {
		expect(countAfter).toBe(countBefore);
	}
});
