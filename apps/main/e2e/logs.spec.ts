import { expect } from '@playwright/test';
import { authenticatedTest as test, navigateToPage } from './fixtures';

test.describe('Logs Page', () => {
	test.beforeEach(async ({ posPage: page }) => {
		await navigateToPage(page, 'logs');
		const screen = page.getByTestId('screen-logs');
		await expect(screen.getByTestId('search-logs')).toBeVisible({ timeout: 30_000 });
	});

	test('should display logs table with columns', async ({ posPage: page }) => {
		const screen = page.getByTestId('screen-logs');
		await expect(screen.getByRole('columnheader').first()).toBeVisible({ timeout: 10_000 });
		await expect(screen.getByRole('columnheader').nth(1)).toBeVisible();
		await expect(screen.getByRole('columnheader').nth(2)).toBeVisible();
	});

	test('should search logs', async ({ posPage: page }) => {
		const screen = page.getByTestId('screen-logs');
		const searchInput = screen.getByTestId('search-logs');
		await searchInput.fill('error');
		await page.waitForTimeout(1_000);

		await expect(screen.getByRole('columnheader').first()).toBeVisible({ timeout: 15_000 });
	});
});
