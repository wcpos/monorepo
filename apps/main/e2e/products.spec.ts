import { expect, type Page } from '@playwright/test';

import {
	addCheckoutProbeProduct,
	findVariableProduct,
	isolatedProductTest as simpleProductTest,
	isolatedVariableProductTest as test,
} from './checkout-probe';
import { LOADED_COUNT_READY, LOADED_COUNT_TEST_ID } from './catalogue-readiness';
import { searchAndWaitForServer, type SearchProbe } from './search-probe';

function productSearchTest(title: string) {
	simpleProductTest(title, async ({ posPage: page, runPrivateSimpleProducts }) => {
		simpleProductTest.skip(
			!runPrivateSimpleProducts,
			'E2E product-writer credentials are not configured'
		);
		const probe = runPrivateSimpleProducts![0];
		await assertRunPrivateProductSearch(page, probe);
	});
}

async function assertRunPrivateProductSearch(page: Page, probe: SearchProbe) {
	if (!probe.rowTestId) {
		throw new Error('Run-private simple product is missing its slug-derived row testID');
	}
	await page.getByTestId('view-mode-toggle').click();
	// Change-detection baseline reads the RENDERED count, not the footer sentence —
	// a server-total change in the sentence would satisfy the "changed" poll below
	// without the grid re-rendering (#1345).
	await expect(page.getByTestId('data-table-count')).toBeVisible({ timeout: 15_000 });
	const countEl = page.getByTestId(LOADED_COUNT_TEST_ID);
	const initialText = await countEl.textContent();
	const nonMatchingRow = page
		.locator(`[data-testid^="data-table-row-"]:not([data-testid="${probe.rowTestId}"]):visible`)
		.first();
	await expect(nonMatchingRow).toBeVisible({ timeout: 30_000 });
	const nonMatchingRowTestId = await nonMatchingRow.getAttribute('data-testid');
	if (!nonMatchingRowTestId) {
		throw new Error('Visible non-matching product row is missing its data-testid');
	}
	await searchAndWaitForServer(page, page.getByTestId('search-products'), 'products', probe.token);
	await expect(page.getByTestId(probe.rowTestId)).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId(nonMatchingRowTestId)).not.toBeVisible();
	await expect.poll(() => countEl.textContent(), { timeout: 15_000 }).not.toBe(initialText);
}

/**
 * Product browsing and search in the POS panel (both free and pro).
 *
 * The default view mode is "grid" (tile view). Tests cover both the grid
 * and table views, as well as toggling between them.
 */
test.describe('Products in POS', () => {
	test('should display product tiles in grid view by default', async ({ posPage: page }) => {
		const tiles = page.getByTestId('product-tile').or(page.getByTestId('variable-product-tile'));
		await expect(tiles.first()).toBeVisible({ timeout: 15_000 });

		const tileCount = await tiles.count();
		expect(tileCount).toBeGreaterThanOrEqual(1);
		await expect(page.getByTestId('data-table-count')).toBeVisible();
	});

	test('should display the view mode toggle button', async ({ posPage: page }) => {
		await expect(page.getByTestId('view-mode-toggle')).toBeVisible();
	});

	test('should switch from grid view to table view', async ({ posPage: page }) => {
		// Default is grid — verify tiles are showing
		const tiles = page.getByTestId('product-tile').or(page.getByTestId('variable-product-tile'));
		await expect(tiles.first()).toBeVisible({ timeout: 15_000 });

		// Click toggle to switch to table view
		await page.getByTestId('view-mode-toggle').click();

		// Table view should show column headers
		const columnheaders = page.getByRole('columnheader');
		await expect(columnheaders.first()).toBeVisible({ timeout: 15_000 });
		expect(await columnheaders.count()).toBeGreaterThanOrEqual(2);
	});

	test('should switch from table view back to grid view', async ({ posPage: page }) => {
		// Switch to table first
		await page.getByTestId('view-mode-toggle').click();
		await expect(page.getByRole('columnheader').first()).toBeVisible({ timeout: 15_000 });

		// Switch back to grid
		await page.getByTestId('view-mode-toggle').click();

		// Tiles should reappear
		const tiles = page.getByTestId('product-tile').or(page.getByTestId('variable-product-tile'));
		await expect(tiles.first()).toBeVisible({ timeout: 15_000 });
	});

	productSearchTest('should search products by name');

	test('should clear search and show all products', async ({ posPage: page }) => {
		const searchInput = page.getByTestId('search-products');

		await searchInput.fill('test');
		await page.waitForTimeout(1_000);

		await searchInput.clear();
		await page.waitForTimeout(1_000);

		// LOCAL rows, not the footer sentence: /[1-9]/ on "Showing {shown} of {total}"
		// matches the server total and passes on an empty grid (#1336, #1345).
		await expect(page.getByTestId(LOADED_COUNT_TEST_ID)).toHaveText(LOADED_COUNT_READY);
	});

	test('should show "No products found" for nonsense search', async ({ posPage: page }) => {
		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('zzzznonexistentproductzzzz');
		await page.waitForTimeout(1_000);

		await expect(page.getByTestId('no-data-message')).toBeVisible({ timeout: 15_000 });
	});

	productSearchTest('should update product count after search');

	simpleProductTest(
		'should add a simple product to cart by clicking tile',
		async ({ posPage: page }) => {
			await addCheckoutProbeProduct(page);
		}
	);

	test('should show variable product tiles in grid view', async ({ posPage: page }) => {
		await findVariableProduct(page, page.getByTestId('screen-pos').getByTestId('search-products'));

		const variableTiles = page.getByTestId('variable-product-tile');
		await expect(variableTiles.first()).toBeVisible({ timeout: 10_000 });
	});

	test('should open variation popover when clicking variable product tile', async ({
		posPage: page,
	}) => {
		await findVariableProduct(page, page.getByTestId('screen-pos').getByTestId('search-products'));

		const variableTile = page.getByTestId('variable-product-tile');
		await expect(variableTile.first()).toBeVisible({ timeout: 10_000 });
		await variableTile.first().click();
		// The popover renders with role="dialog" from the Popover component
		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
	});

	simpleProductTest('should add product to cart in table view', async ({ posPage: page }) => {
		// Switch to table view
		await page.getByTestId('view-mode-toggle').click();
		await expect(page.getByRole('columnheader').first()).toBeVisible({ timeout: 15_000 });

		await addCheckoutProbeProduct(page);
	});
});
