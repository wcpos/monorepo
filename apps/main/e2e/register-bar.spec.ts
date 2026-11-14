import { expect } from '@playwright/test';

import { authenticatedTest as test } from './fixtures';

test('POS uses the register bar and opens the cashier sheet', async ({ posPage: page }) => {
	await expect(page.getByTestId('header-title-container')).toHaveCount(0);
	await expect(page.getByTestId('register-bar-place')).toBeVisible();
	await page.getByTestId('register-bar-avatar').click();
	await expect(page.getByTestId('user-sheet')).toBeVisible();
	await expect(page.getByTestId('user-sheet-sign-out')).toBeVisible();
});
