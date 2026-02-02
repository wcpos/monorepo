import { expect } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

test.describe('Logs Page', () => {
	test.beforeEach(async ({ posPage: page }) => {
		await page.getByText('Logs', { exact: true }).click();
		await expect(page.getByPlaceholder('Search Logs')).toBeVisible({ timeout: 30_000 });
	});

	test('should display logs table', async ({ posPage: page }) => {
		// Logs page should have a table with log entries or empty state
		const hasLogs = await page
			.getByText(/Showing \d+ of \d+/)
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		const noLogs = await page
			.getByText(/No logs found/i)
			.isVisible({ timeout: 5_000 })
			.catch(() => false);
		expect(hasLogs || noLogs).toBeTruthy();
	});

	test('should search logs', async ({ posPage: page }) => {
		const searchInput = page.getByPlaceholder('Search Logs');
		await searchInput.fill('error');
		await page.waitForTimeout(1_000);

		// After search, either filtered results or empty state
		const hasResults = await page
			.getByText(/Showing \d+ of \d+/)
			.isVisible({ timeout: 5_000 })
			.catch(() => false);
		const noResults = await page
			.getByText(/No logs found/i)
			.isVisible({ timeout: 5_000 })
			.catch(() => false);
		expect(hasResults || noResults).toBeTruthy();
	});
});
