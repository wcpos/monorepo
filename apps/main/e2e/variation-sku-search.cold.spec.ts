import { expect, type Page } from '@playwright/test';

import { probeVariationSearch, coldStartTest as test } from './cold-start';
import { getStoreUrl } from './fixtures';

/**
 * Variation-SKU search on a THIN local catalogue — wcpos/monorepo#991,
 * live-exercising the remote variations search lane (#950 / PR #987 client
 * half + wcpos/woocommerce-pos#1441 server half).
 *
 * These assertions are only meaningful under the cold-start profile: with the
 * demo catalogue fully resident, a purely local search finds the variation and
 * the missing remote lane stays invisible. Run with:
 *
 *   E2E_COLD_START=1 npx playwright test --project=pro-cold-start
 */

/** Partial SKU used to discover a real variation on the store under test. */
const VARIATION_SKU_TERM = process.env.E2E_VARIATION_SKU_TERM || 'woo-hoodie';

/**
 * The POS grid defaults to tile view; variation rows only exist in table view.
 * Switch only when the table markers are absent, since the persisted UI setting
 * can differ between environments.
 */
async function ensureTableView(page: Page): Promise<void> {
	const expandLink = page.getByTestId('variable-product-expand').first();
	if (await expandLink.isVisible().catch(() => false)) {
		return;
	}
	await page.getByTestId('view-mode-toggle').click();
	await expect(expandLink).toBeVisible({ timeout: 30_000 });
}

test.describe('Cold start — variation SKU search', () => {
	test('the local catalogue starts (and stays) empty', async ({ posPage: page }) => {
		// Guards the profile itself: if the thin-catalogue mechanism silently
		// stopped working, every other cold spec would pass for the wrong reason.
		await expect(page.getByTestId('no-data-message')).toBeVisible({ timeout: 60_000 });
		const anyProduct = page
			.getByTestId('product-tile')
			.or(page.getByTestId('variable-product-tile'))
			.first();
		await expect(anyProduct).toBeHidden();
	});

	test('searching a variation SKU pulls the non-resident variation from the server', async ({
		posPage: page,
		storeAuthorization,
		request,
	}, testInfo) => {
		const probe = await probeVariationSearch(
			request,
			getStoreUrl(testInfo),
			storeAuthorization(),
			VARIATION_SKU_TERM
		);
		if (!probe.supported) {
			test.skip(
				true,
				`needs wcpos/v2 variations search — wcpos/woocommerce-pos#1441 (${probe.reason})`
			);
			return;
		}

		// The proof that a REMOTE lane ran: with the catalogue thin, a local-only
		// search cannot produce this request, and cannot produce any result.
		const variationSearchRequest = page.waitForRequest(
			(candidate) =>
				candidate.url().includes('/wcpos/v2/variations') &&
				/[?&](search|sku)=/.test(candidate.url()),
			{ timeout: 60_000 }
		);

		await page.getByTestId('search-products').fill(probe.sku);
		const variationRequest = await variationSearchRequest;
		const requestUrl = new URL(variationRequest.url());
		expect([requestUrl.searchParams.get('search'), requestUrl.searchParams.get('sku')]).toContain(
			probe.sku
		);

		// The matching variation's PARENT is what the grid lists (the relational
		// binding hydrates parents for child search hits).
		const variableProduct = page
			.getByTestId('variable-product-tile')
			.or(page.getByTestId('variable-product-expand'))
			.first();
		await expect(variableProduct).toBeVisible({ timeout: 60_000 });

		await ensureTableView(page);
		await page.getByTestId('variable-product-expand').first().click();
		const cartLines = page.getByTestId('cart-quantity-input');
		const cartLineCount = await cartLines.count();
		const addVariationButton = page.getByTestId('add-variation-to-cart-button').first();
		await expect(addVariationButton).toBeVisible({
			timeout: 30_000,
		});
		await addVariationButton.click();
		await expect(cartLines).toHaveCount(cartLineCount + 1, { timeout: 30_000 });
	});
});
