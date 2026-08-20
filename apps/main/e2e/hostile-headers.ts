import { test as base, expect, type Page } from '@playwright/test';

import {
	authenticatedTest,
	getStoreUrl,
	hydrateAuthenticatedPage,
	navigateToPage,
} from './fixtures';

const STRIPPED_HEADERS = [
	'access-control-expose-headers',
	'etag',
	'link',
	'x-server-load',
	'x-wcpos-memory-peak',
	'x-wcpos-pressure',
	'x-wp-total',
	'x-wp-totalpages',
] as const;

/** Simulate a browser/proxy that makes every Tier 2 response header unreadable. */
async function installHostileHeaders(page: Page, storeUrl: string): Promise<void> {
	const storeOrigin = new URL(storeUrl).origin;
	await page.route('**/*', async (route) => {
		const requestUrl = new URL(route.request().url());
		if (requestUrl.origin !== storeOrigin) {
			await route.fallback();
			return;
		}

		const response = await route.fetch();
		const headers = response.headers();
		for (const name of STRIPPED_HEADERS) delete headers[name];
		await route.fulfill({ response, headers });
	});
}

const test = authenticatedTest.extend({
	posPage: async ({ page }, use, testInfo) => {
		await hydrateAuthenticatedPage(page, testInfo, {
			beforeBoot: (bootPage) => installHostileHeaders(bootPage, getStoreUrl(testInfo)),
		});
		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API
		await use(page);
	},
});

test('census and order browse survive stripped Tier 2 headers', async ({ posPage: page }) => {
	const posScreen = page.getByTestId('screen-pos').filter({ visible: true }).first();
	const productTotal = posScreen.getByTestId('data-table-total-count');
	const emptyState = posScreen.getByTestId('no-data-message');
	// Store-agnostic gate: a settled empty grid (the app's own zero-rows state,
	// with no error toast) is a declared-missing environment and skips; a grid
	// that never settles under stripped headers is the regression and fails.
	await expect
		.poll(
			async () => {
				if (await emptyState.isVisible().catch(() => false)) return 'empty';
				const total = Number(await productTotal.textContent().catch(() => null));
				return Number.isFinite(total) && total > 0 ? 'populated' : 'pending';
			},
			{ timeout: 120_000 }
		)
		.not.toBe('pending');
	test.skip(
		await emptyState.isVisible().catch(() => false),
		'Store has zero products in scope — declared-missing environment per the store-agnostic policy.'
	);

	await navigateToPage(page, 'orders');
	const orders = page.getByTestId('screen-orders');
	await expect(orders.getByTestId('search-orders')).toBeVisible({
		timeout: 30_000,
	});
	await expect(
		orders.getByTestId('data-table-count').or(orders.getByTestId('no-data-message')).first()
	).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
});

base('URL discovery falls back successfully when Link is stripped', async ({ page }, testInfo) => {
	const storeUrl = getStoreUrl(testInfo);
	await installHostileHeaders(page, storeUrl);
	await page.goto('/');
	await expect(page.getByTestId('connect-store-button')).toBeVisible({
		timeout: 60_000,
	});
	await page.getByTestId('store-url-input').fill(storeUrl);
	await page.getByTestId('connect-store-button').click();

	await expect(page.getByTestId('logged-in-users-label')).toBeVisible({
		timeout: 60_000,
	});
	await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
});
