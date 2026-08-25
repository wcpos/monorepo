import { errors, expect, type Locator, type Page } from '@playwright/test';

import { LOADED_COUNT_READY, LOADED_COUNT_TEST_ID } from './catalogue-readiness';
import {
	findVariableProduct,
	isolatedVariableProductTest as test,
	variableProductProbe,
} from './checkout-probe';
import { becomesVisible, isWcposRestRoute } from './fixtures';
import { unwrapWireBody } from './wire-envelope';
import { ensureTableView } from './pos-view-mode';

/**
 * Search the worker-private variable product and wait for it to render.
 * Secretless forks retain the sample-catalog fallback in findVariableProduct.
 */
async function searchForVariableProduct(page: Page) {
	// These tests require table view — switch if needed
	await ensureTableView(page);

	await findVariableProduct(page, page.getByTestId('screen-pos').getByTestId('search-products'));

	// Verify we got results — product sync can be slow in CI. Gate on the LOCAL
	// loaded count, not the footer sentence: /[1-9]/ on "Showing {shown} of {total}"
	// matches the server total and passes on an empty grid (#1336, #1345).
	await expect(page.getByTestId(LOADED_COUNT_TEST_ID)).toHaveText(LOADED_COUNT_READY, {
		timeout: 30_000,
	});

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
			(response) => isWcposRestRoute(response.url(), '/wcpos/v2/variations') && response.ok(),
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

		// The enabled-check window is racy by nature: a prior selection's
		// re-filter can disable or detach this option before the click lands, and
		// click() would then burn its full inherited timeout and THROW — failing
		// the test instead of moving on. Short explicit timeout; only a
		// TimeoutError means "state moved on, try the next option".
		try {
			await option.click({ timeout: 1_000 });
		} catch (error) {
			if (error instanceof errors.TimeoutError) {
				continue;
			}
			throw error;
		}

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
				(response) => isWcposRestRoute(response.url(), '/wcpos/v2/variations') && response.ok(),
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
				(response) => isWcposRestRoute(response.url(), '/wcpos/v2/variations') && response.ok(),
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
				(response) => isWcposRestRoute(response.url(), '/wcpos/v2/variations') && response.ok(),
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
				(response) => isWcposRestRoute(response.url(), '/wcpos/v2/variations') && response.ok(),
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

	/**
	 * The variation thumbnail renders the image the SERVER sent.
	 *
	 * This pair is the whole point. The wcpos/v2 lane hydrates variations through
	 * WooCommerce's PRODUCTS controller, so a variation document carries `images[]`,
	 * while the wc/v3 variations shape our v1 lane serves carries a singular `image`.
	 * The client read only `image`, and every variation thumbnail on a 1.10.0 store
	 * went blank (#1577) with both sides individually green — the plugin's
	 * `Test_Catalog_Proxy_Images` asserts what the server SENDS, and nothing here
	 * asserted what the client READS. Reading the src out of the live response and
	 * then out of that variation's row is the only check that spans the seam.
	 *
	 * The probe seeds its variations with a real attachment for exactly this test, so
	 * "no image to assert on" is an environment shortfall (a store with no product
	 * imagery to borrow at all), never a quietly green run.
	 */
	test('should render the variation image the server sent', async ({ posPage: page }) => {
		const probe = variableProductProbe(page);
		test.skip(probe === null, 'No product-writer credentials configured — probe has no image');
		// A store that declared writer credentials and then FAILED the donor read is a broken
		// environment, not a bare one: fail on it, or an auth/server regression skips its way to
		// green (E2E store-agnostic policy, CLAUDE.md).
		expect(
			probe!.imageLookupFailure ?? null,
			'the donor-image lookup failed on a store with writer credentials'
		).toBeNull();
		test.skip(
			probe!.imageAttachmentId === null || probe!.imageAttachmentId === undefined,
			'No product in this store carries an image the probe could borrow'
		);

		await searchForVariableProduct(page);

		// Correlate on the PARENT, not just the route. Search demand and background prefetch pull
		// /wcpos/v2/variations too, so a route-only predicate can resolve with another product's
		// documents — whose ids have no row under this expansion, turning a real oracle into a
		// flake that reports the wrong thing.
		const expandLink = page.getByTestId('variable-product-expand').first();
		const [response] = await Promise.all([
			page.waitForResponse(
				async (res) => {
					if (!isWcposRestRoute(res.url(), '/wcpos/v2/variations') || !res.ok()) return false;
					const parsed = unwrapWireBody(await res.json().catch(() => null)) as {
						documents?: { parent_id?: number }[];
					} | null;
					return (parsed?.documents ?? []).some((doc) => doc.parent_id === probe!.id);
				},
				{ timeout: 30_000 }
			),
			expandLink.click(),
		]);

		const body = unwrapWireBody(await response.json()) as {
			documents?: {
				id?: number;
				parent_id?: number;
				payload?: { images?: { src?: string }[]; image?: { src?: string } };
			}[];
		};
		// The server's answer, read the way the cell reads it. A store on the v1 lane sends
		// the singular `image`; 1.10.0+ sends `images[]`. Either resolves — neither being
		// present is the regression, on whichever side introduced it.
		const withImage = (body.documents ?? [])
			.filter((doc) => doc.parent_id === probe!.id)
			.find((doc) => doc.payload?.images?.[0]?.src || doc.payload?.image?.src);
		expect(
			withImage,
			'the seeded variations came back from /wcpos/v2/variations with no image src'
		).toBeDefined();

		const row = page.getByTestId(`data-table-row-variation-${withImage!.id}`);
		await expect(row).toBeVisible({ timeout: 30_000 });

		// The cell resolves the URL to a local object URL before painting, so the rendered src
		// can never be compared to the wire URL — its EMPTINESS is the bug's whole signature.
		await expect
			.poll(async () => (await row.locator('img').first().getAttribute('src')) ?? '', {
				timeout: 30_000,
			})
			.not.toBe('');
	});

	test('should increment quantity when adding same variation twice', async ({ posPage: page }) => {
		await searchForVariableProduct(page);

		// Expand the variable product row
		const expandLink = page.getByTestId('variable-product-expand').first();
		await Promise.all([
			page.waitForResponse(
				(response) => isWcposRestRoute(response.url(), '/wcpos/v2/variations') && response.ok(),
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
