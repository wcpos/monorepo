import { expect } from '@playwright/test';
import { authenticatedTest as test, navigateToPage } from './fixtures';

test.describe('Logs Page', () => {
	test.beforeEach(async ({ posPage: page }) => {
		await navigateToPage(page, 'logs');
		await expect(page.getByPlaceholder('Search Logs')).toBeVisible({ timeout: 30_000 });
	});

	test('should display logs table with columns', async ({ posPage: page }) => {
		// Logs table should show Time, Level, Message columns
		await expect(page.getByRole('columnheader', { name: 'Time' })).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('columnheader', { name: 'Level' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Message' })).toBeVisible();
	});

	test('should search logs', async ({ posPage: page }) => {
		const searchInput = page.getByPlaceholder('Search Logs');
		await searchInput.fill('error');
		await page.waitForTimeout(1_000);

		// Table should still be visible (with filtered or no results)
		await expect(page.getByRole('columnheader', { name: 'Time' })).toBeVisible({ timeout: 5_000 });
	});
});
