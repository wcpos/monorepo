import { expect, type Locator, type Page } from '@playwright/test';

import { findVariableProduct, isolatedVariableProductTest as test } from './checkout-probe';
import { becomesVisible } from './fixtures';

/**
 * Helper: ensure the POS products are in table view (not grid view).
 * The variation popover button and expand link only appear in table view.
 * The default view mode may differ between environments.
 */
async function ensureTableView(page: Page) {
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
 * Search the worker-private variable product and wait for it to render.
 * Secretless forks retain the sample-catalog fallback in findVariableProduct.
 */
async function searchForVariableProduct(page: Page) {
	// These tests require table view — switch if needed
	await ensureTableView(page);

	await findVariableProduct(page, page.getByTestId('screen-pos').getByTestId('search-products'));

	// Verify we got results — product sync can be slow in CI
	const countEl = page.getByTestId('data-table-count');
	await expect(countEl).toBeVisible({ timeout: 30_000 });
	await expect(countEl).toContainText(/[1-9]/, { timeout: 30_000 });

	// Re-ensure table mode after results load in case settings hydration flips mode.
	await ensureTableView(page);

	// Verify there's at least one variable product popover button.
	// Variable products render a chevron button instead of a "+" button.
	const popoverButton = page.getByTestId('variable-product-popover-button').first();
	await expect(popoverButton).toBeVisible({ timeout: 30_000 });
}

/**
 * Open the variable-product popover and return its dialog content.
 */
async function openVariationPopover(page: Page): Promise<Locator> {
	const popoverButton = page.getByTestId('variable-product-popover-button').first();

	// Opening the popover mounts the variations binding, which lazily syncs the
	// parent's variations from WooCommerce. Wait for that response before
	// interacting so attribute selection resolves against complete data rather
	// than racing an in-flight sync (which would leave the "Add to Cart" button
	// hidden). Mirrors the guard the expanded-row tests already use.
	await Promise.all([
		page.waitForResponse(
			(response) => response.url().includes('/wp-json/wcpos/v2/variations?') && response.ok(),
			{ timeout: 30_000 }
		),
		popoverButton.click(),
	]);

	const popoverDialog = page.getByRole('dialog').last();
	await expect(popoverDialog).toBeVisible({ timeout: 10_000 });
	return popoverDialog;
}

/**
 * Select variation options until a valid combination resolves.
 *
 * Two ordering hazards live here, and both produced the recurring CI failure
 * on this spec (#1114 shard 5, #1124 shard 4 — fails with retries, green on
 * the next run):
 *
 * 1. MATERIALIZATION. Every option's enabled state derives from the LOCAL
 *    variations result (`optionCounts` in the popover): until the synced
 *    variations materialize into the local collection, every count is 0 and
 *    every option renders DISABLED. Sampling `isDisabled()` once in a quick
 *    pass during that window reads "nothing to click", the helper returns
 *    having selected nothing — and the add-to-cart button can then never
 *    appear, because it only renders when a selection narrows the result to
 *    exactly one variation. The popover announces this transient state
 *    (`variation-popover-syncing`), so gate on its end and on an option
 *    actually becoming enabled, rather than trusting a point-in-time sample.
 *
 * 2. RESOLUTION. After a click, the matched-variation lookup needs a re-query
 *    and re-render. The old 1-second poll walked on to the NEXT option when a
 *    slow runner missed the window — and each extra click CHANGES the
 *    single-select group's value, so the walk could march past the completing
 *    combination. Give each selection a real window instead.
 */
async function selectUntilAddToCartVisible(page: Page, popoverDialog: Locator) {
	const options = popoverDialog.locator('[data-testid^="variation-option-"]');
	await expect(options.first()).toBeVisible({ timeout: 15_000 });

	// Materialization gate: wait for the popover to stop syncing AND for at
	// least one option to become enabled. Counts flow from the local result,
	// so "all disabled" while the sync lands is a transient state, not a fact.
	const syncing = popoverDialog.getByTestId('variation-popover-syncing');
	await expect
		.poll(
			async () => {
				if (await syncing.isVisible().catch(() => false)) return false;
				const count = await options.count();
				for (let i = 0; i < count; i++) {
					if (
						await options
							.nth(i)
							.isEnabled()
							.catch(() => false)
					)
						return true;
				}
				return false;
			},
			{ timeout: 30_000 }
		)
		.toBeTruthy();

	const optionCount = await options.count();
	expect(optionCount).toBeGreaterThan(0);

	const addToCartButton = page.getByTestId('variation-popover-add-to-cart');
	for (let i = 0; i < optionCount; i++) {
		const option = options.nth(i);
		// Re-check at click time — enabled-ness can change as selections filter
		// the remaining combinations.
		const isEnabled = await option.isEnabled().catch(() => false);
		if (!isEnabled) {
			continue;
		}

		await option.click();

		const isReady = await expect
			.poll(async () => addToCartButton.isVisible().catch(() => false), { timeout: 5_000 })
			.toBeTruthy()
			.then(() => true)
			.catch(() => false);

		if (isReady) {
			return;
		}
	}
}

/**
 * Helper: void any existing cart items so tests start clean.
 */
async function voidCartIfNeeded(page: Page) {
	const voidButton = page.getByTestId('void-button');
	// `becomesVisible` honours the wait; `isVisible({ timeout })` ignores its
	// timeout, so a void button still rendering would read as "cart empty" and
	// skip the cleanup.
	if (await becomesVisible(voidButton, 1_000)) {
		await voidButton.click();
		await page.waitForTimeout(1_500);
	}
}

/**
 * Variation handling in the POS products table.
 *
 * Tests two flows for adding a variable product variation to the cart:
 * 1. Via the popover (click chevron on variable product row)
 * 2. Via the expanded row (expand variable product, click "+" on a variation)
 */
test.describe('POS Variations', () => {
	test.beforeEach(async ({ posPage: page }) => {
		await voidCartIfNeeded(page);
	});

	test('should show popover button on variable products instead of add-to-cart', async ({
		posPage: page,
	}) => {
		await searchForVariableProduct(page);

		// Variable products should NOT have the simple add-to-cart button
		// They should have the popover button (chevron) instead
		const popoverButton = page.getByTestId('variable-product-popover-button').first();
		await expect(popoverButton).toBeVisible();
	});

	test('should open variation popover when clicking chevron button', async ({ posPage: page }) => {
		await searchForVariableProduct(page);
		await openVariationPopover(page);
	});

	test('should add variation to cart via popover attribute selection', async ({
		posPage: page,
	}) => {
		await searchForVariableProduct(page);
		const popoverDialog = await openVariationPopover(page);
		await selectUntilAddToCartVisible(page, popoverDialog);

		// After selecting all attributes, the "Add to Cart" button should appear
		const addToCartButton = page.getByTestId('variation-popover-add-to-cart');
		await expect(addToCartButton).toBeVisible({ timeout: 15_000 });

		await addToCartButton.click();

		// Verify variation was added to cart
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });

		// Verify a success toast appeared
		await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should show expand link on variable product name', async ({ posPage: page }) => {
		await searchForVariableProduct(page);

		const expandLink = page.getByTestId('variable-product-expand').first();
		await expect(expandLink).toBeVisible({ timeout: 15_000 });
	});

	test('should expand variable product row to show variations', async ({ posPage: page }) => {
		await searchForVariableProduct(page);

		// Click the expand link on the first variable product
		const expandLink = page.getByTestId('variable-product-expand').first();
		await Promise.all([
			page.waitForResponse(
				(response) => response.url().includes('/wp-json/wcpos/v2/variations?') && response.ok(),
				{ timeout: 30_000 }
			),
			expandLink.click(),
		]);

		// Variation rows should now be visible with their "+" buttons
		const variationPlusButtons = page.getByTestId('add-variation-to-cart-button');
		await expect(variationPlusButtons.first()).toBeVisible({ timeout: 15_000 });
	});

	test('should add variation to cart via expanded row plus button', async ({ posPage: page }) => {
		await searchForVariableProduct(page);

		// Expand the variable product row
		const expandLink = page.getByTestId('variable-product-expand').first();
		await Promise.all([
			page.waitForResponse(
				(response) => response.url().includes('/wp-json/wcpos/v2/variations?') && response.ok(),
				{ timeout: 30_000 }
			),
			expandLink.click(),
		]);

		// Click the "+" button on the first variation
		const variationPlusButton = page.getByTestId('add-variation-to-cart-button').first();
		await expect(variationPlusButton).toBeVisible({ timeout: 15_000 });
		await variationPlusButton.click();

		// Verify variation was added to cart
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });

		// Verify a success toast appeared
		await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should collapse expanded variable product row', async ({ posPage: page }) => {
		await searchForVariableProduct(page);

		// Expand
		const expandLink = page.getByTestId('variable-product-expand').first();
		await Promise.all([
			page.waitForResponse(
				(response) => response.url().includes('/wp-json/wcpos/v2/variations?') && response.ok(),
				{ timeout: 30_000 }
			),
			expandLink.click(),
		]);

		const variationPlusButtons = page.getByTestId('add-variation-to-cart-button');
		await expect(variationPlusButtons.first()).toBeVisible({ timeout: 15_000 });

		// Collapse by clicking the same link again
		await expandLink.click();
		await page.waitForTimeout(1_000);

		// Variation "+" buttons should no longer be visible
		await expect(variationPlusButtons.first()).not.toBeVisible({ timeout: 10_000 });
	});

	test('should add multiple variations to cart', async ({ posPage: page }) => {
		await searchForVariableProduct(page);

		// Expand the variable product row
		const expandLink = page.getByTestId('variable-product-expand').first();
		await Promise.all([
			page.waitForResponse(
				(response) => response.url().includes('/wp-json/wcpos/v2/variations?') && response.ok(),
				{ timeout: 30_000 }
			),
			expandLink.click(),
		]);

		const variationPlusButtons = page.getByTestId('add-variation-to-cart-button');
		await expect(variationPlusButtons.first()).toBeVisible({ timeout: 15_000 });

		const buttonCount = await variationPlusButtons.count();
		expect(buttonCount).toBeGreaterThanOrEqual(2);

		// Add first variation
		await variationPlusButtons.nth(0).click();
		await page.waitForTimeout(500);

		// Add second variation
		await variationPlusButtons.nth(1).click();
		await page.waitForTimeout(500);

		// Cart should show the checkout button
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });
	});

	test('should increment quantity when adding same variation twice', async ({ posPage: page }) => {
		await searchForVariableProduct(page);

		// Expand the variable product row
		const expandLink = page.getByTestId('variable-product-expand').first();
		await Promise.all([
			page.waitForResponse(
				(response) => response.url().includes('/wp-json/wcpos/v2/variations?') && response.ok(),
				{ timeout: 30_000 }
			),
			expandLink.click(),
		]);

		const variationPlusButton = page.getByTestId('add-variation-to-cart-button').first();
		await expect(variationPlusButton).toBeVisible({ timeout: 15_000 });

		// Add the same variation twice
		await variationPlusButton.click();
		await page.waitForTimeout(1_000);
		await variationPlusButton.click();
		await page.waitForTimeout(1_000);

		// Should have checkout button
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });

		// Should see at least one cart quantity input with value "2"
		const quantityInputs = page.getByTestId('cart-quantity-input');
		await expect(quantityInputs.first()).toBeVisible({ timeout: 10_000 });
		await expect(quantityInputs.first()).toContainText('2', { timeout: 5_000 });
	});
});
