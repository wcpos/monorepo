import { expect } from '@playwright/test';

import { authenticatedTest, navigateToPage } from './fixtures';

authenticatedTest.describe('Authenticated Navigation', () => {
	authenticatedTest('should show the POS screen after login', async ({ posPage: page }) => {
		await expect(page.getByTestId('search-products')).toBeVisible();
	});

	authenticatedTest('should be responsive on mobile viewport', async ({ posPage: page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await expect(page.getByTestId('search-products')).toBeVisible({ timeout: 10_000 });
	});

	authenticatedTest('should be responsive on desktop viewport', async ({ posPage: page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await expect(page.getByTestId('search-products')).toBeVisible();
		await expect(page.getByTestId('cart-customer-name')).toBeVisible();
	});
});

authenticatedTest.describe('Drawer Navigation', () => {
	authenticatedTest('should have all sidebar navigation buttons', async ({ posPage: page }) => {
		const routes = [
			'pos',
			'products',
			'orders',
			'coupons',
			'customers',
			'reports',
			'health',
			'settings',
			'support',
		];

		for (const route of routes) {
			await expect(page.getByTestId(`drawer-item-${route}`)).toBeVisible();
		}
	});

	authenticatedTest('should navigate to Logs inside Store health', async ({ posPage: page }) => {
		await navigateToPage(page, 'health');
		await page.getByTestId('health-nav-logs').click();
		await expect(page.getByTestId('screen-logs').getByTestId('search-logs')).toBeVisible({
			timeout: 30_000,
		});
	});

	authenticatedTest('should navigate to Support page', async ({ posPage: page }) => {
		await navigateToPage(page, 'support');
		await expect(page.getByTestId('screen-support').locator('iframe').first()).toBeVisible({
			timeout: 30_000,
		});
	});

	authenticatedTest('should navigate to a page and back to POS', async ({ posPage: page }) => {
		await navigateToPage(page, 'health');
		await page.getByTestId('health-nav-logs').click();
		await expect(page.getByTestId('screen-logs').getByTestId('search-logs')).toBeVisible({
			timeout: 30_000,
		});

		// Wait for logs page to fully render before navigating away
		await page.waitForTimeout(1_000);

		await navigateToPage(page, 'pos');

		// The POS screen should show the search products input
		// Try both screen-pos testId and just the placeholder directly
		const posScreen = page.getByTestId('screen-pos');
		const searchProducts = posScreen
			.getByTestId('search-products')
			.or(page.getByTestId('search-products'));
		await expect(searchProducts.first()).toBeVisible({ timeout: 30_000 });
	});
});
