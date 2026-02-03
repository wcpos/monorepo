import { expect } from '@playwright/test';
import { authenticatedTest, navigateToPage } from './fixtures';

authenticatedTest.describe('Authenticated Navigation', () => {
	authenticatedTest('should show the POS screen after login', async ({ posPage: page }) => {
		await expect(page.getByPlaceholder('Search Products')).toBeVisible();
	});

	authenticatedTest('should be responsive on mobile viewport', async ({ posPage: page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await expect(page.getByPlaceholder('Search Products')).toBeVisible({ timeout: 10_000 });
	});

	authenticatedTest('should be responsive on desktop viewport', async ({ posPage: page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await expect(page.getByPlaceholder('Search Products')).toBeVisible();
		await expect(page.getByText('Guest')).toBeVisible();
	});
});

authenticatedTest.describe('Drawer Navigation', () => {
	authenticatedTest(
		'should have all sidebar navigation buttons',
		async ({ posPage: page }) => {
			// On lg screens the drawer shows icon-only buttons; verify the correct count exists
			const allButtons = page.locator('button');
			const count = await allButtons.count();
			const sidebarButtons: any[] = [];

			for (let i = 0; i < count; i++) {
				const btn = allButtons.nth(i);
				const box = await btn.boundingBox();
				if (box && box.x < 60 && box.width < 60) {
					sidebarButtons.push(btn);
				}
			}

			// Should have at least 7 sidebar buttons (POS, Products, Orders, Customers, Reports, Logs, Support)
			expect(sidebarButtons.length).toBeGreaterThanOrEqual(7);
		}
	);

	authenticatedTest(
		'should navigate to Logs page',
		async ({ posPage: page }) => {
			await navigateToPage(page, 'logs');
			await expect(page.getByTestId('screen-logs').getByPlaceholder('Search Logs')).toBeVisible({ timeout: 30_000 });
		}
	);

	authenticatedTest(
		'should navigate to Support page',
		async ({ posPage: page }) => {
			await navigateToPage(page, 'support');
			await expect(page.getByTestId('screen-support').locator('iframe').first()).toBeVisible({
				timeout: 30_000,
			});
		}
	);

	authenticatedTest(
		'should navigate to a page and back to POS',
		async ({ posPage: page }) => {
			await navigateToPage(page, 'logs');
			await expect(page.getByTestId('screen-logs').getByPlaceholder('Search Logs')).toBeVisible({ timeout: 30_000 });

			// Wait for logs page to fully render before navigating away
			await page.waitForTimeout(1_000);

			await navigateToPage(page, 'pos');

			// The POS screen should show the search products input
			// Try both screen-pos testId and just the placeholder directly
			const posScreen = page.getByTestId('screen-pos');
			const searchProducts = posScreen.getByPlaceholder('Search Products').or(page.getByPlaceholder('Search Products'));
			await expect(searchProducts.first()).toBeVisible({ timeout: 30_000 });
		}
	);
});
