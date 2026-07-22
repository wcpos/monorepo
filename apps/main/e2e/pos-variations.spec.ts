import { expect, type Locator, type Page } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

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
 * Helper: search for a variable product (WooCommerce sample data "hoodie")
 * and wait for results to appear. Variable products may take longer to sync
 * from WooCommerce in CI, so we use generous timeouts.
 */
async function searchForVariableProduct(page: Page) {
	// These tests require table view — switch if needed
	await ensureTableView(page);

	const searchInput = page.getByTestId('search-products');
	await searchInput.fill('hoodie');
	await page.waitForTimeout(2_000);

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
	await popoverButton.click();

	const popoverDialog = page.getByRole('dialog').last();
	await expect(popoverDialog).toBeVisible({ timeout: 10_000 });
	return popoverDialog;
}

/**
 * Select one enabled variation option from each attribute group.
 */
async function selectUntilAddToCartVisible(page: Page, popoverDialog: Locator) {
	const optionGroups = popoverDialog.locator(
		'[role="group"]:has([data-testid^="variation-option-"])'
	);
	await expect(optionGroups.first()).toBeVisible({ timeout: 15_000 });

	const groupCount = await optionGroups.count();
	expect(groupCount).toBeGreaterThan(0);

	for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
		const options = optionGroups.nth(groupIndex).locator('[data-testid^="variation-option-"]');
		const optionCount = await options.count();
		let selected = false;

		for (let optionIndex = 0; optionIndex < optionCount; optionIndex++) {
			const option = options.nth(optionIndex);
			if (await option.isDisabled().catch(() => true)) {
				continue;
			}

			await option.click();
			selected = true;
			break;
		}

		expect(selected).toBeTruthy();
	}

	await expect(page.getByTestId('variation-popover-add-to-cart')).toBeVisible({
		timeout: 15_000,
	});
}

/**
 * Helper: void any existing cart items so tests start clean.
 */
async function voidCartIfNeeded(page: Page) {
	const voidButton = page.getByTestId('void-button');
	if (await voidButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
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

	test('should open variation popover when clicking chevron button', async ({
		posPage: page,
	}) => {
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

	test('should add variation to cart via expanded row plus button', async ({
		posPage: page,
	}) => {
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

	test('should increment quantity when adding same variation twice', async ({
		posPage: page,
	}) => {
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
