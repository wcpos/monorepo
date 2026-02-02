import { expect } from '@playwright/test';
import { authenticatedTest as test, navigateToPage } from './fixtures';

test.describe('Logs Page', () => {
	test.beforeEach(async ({ posPage: page }) => {
		await navigateToPage(page, 'logs');
		const screen = page.getByTestId('screen-logs');
		await expect(screen.getByPlaceholder('Search Logs')).toBeVisible({ timeout: 30_000 });
	});

	test('should display logs table with columns', async ({ posPage: page }) => {
		const screen = page.getByTestId('screen-logs');
		await expect(screen.getByRole('columnheader', { name: 'Time' })).toBeVisible({ timeout: 10_000 });
		await expect(screen.getByRole('columnheader', { name: 'Level' })).toBeVisible();
		await expect(screen.getByRole('columnheader', { name: 'Message' })).toBeVisible();
	});

	test('should search logs', async ({ posPage: page }) => {
		const screen = page.getByTestId('screen-logs');
		const searchInput = screen.getByPlaceholder('Search Logs');
		await searchInput.fill('error');
		await page.waitForTimeout(1_000);

		await expect(screen.getByRole('columnheader', { name: 'Time' })).toBeVisible({ timeout: 5_000 });
	});
});
