import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron, expect, test } from '@playwright/test';

import { PRO_STORE_URL } from '../playwright.config';
import { navigateToPage } from './fixtures';
import { expectSearchResponsive, measureSearch } from './search-responsiveness';

// Point at a packaged app containing the renderer under test, never a user's profile.
// E2E_ELECTRON_EXECUTABLE=/path/to/packaged-executable
// pnpm exec playwright test -c playwright.search-performance.config.ts -g 'desktop search'
test('desktop search preserves typing and reports frame smoothness', async ({}, testInfo) => {
	const executablePath = process.env.E2E_ELECTRON_EXECUTABLE;
	test.skip(!executablePath, 'No packaged Electron artifact supplied');
	test.setTimeout(240_000);
	const profile = await mkdtemp(join(tmpdir(), 'wcpos-search-profile-'));
	const app = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`] });
	try {
		expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(profile);
		const page = await app.firstWindow();
		await page.getByTestId('store-url-input').fill(PRO_STORE_URL);
		await page.getByTestId('connect-button').click();
		await expect(page.getByTestId('add-user-button')).toBeVisible({ timeout: 30_000 });
		const loginWindow = app.waitForEvent('window');
		await page.getByTestId('add-user-button').click();
		const login = await loginWindow;
		// WordPress-owned login form: the same structural selectors as web auth.
		await login
			.locator('#user_login, #wcpos-user-login')
			.first()
			.fill(process.env.E2E_USERNAME ?? 'demo');
		await login
			.locator('#user_pass, #wcpos-user-pass')
			.first()
			.fill(process.env.E2E_PASSWORD ?? 'demo');
		await login.locator('#wp-submit, #wcpos-login-submit, button[type="submit"]').first().click();
		await page.getByTestId('wp-user-button').first().click({ timeout: 30_000 });
		const open = page.getByTestId('open-pos-button').first();
		await expect(open).toBeVisible();
		if (await open.isDisabled()) await page.getByRole('radio').first().click();
		await open.click();
		await expect(page.getByTestId('search-products').filter({ visible: true })).toBeVisible({
			timeout: 60_000,
		});
		for (const route of ['pos', 'products', 'orders', 'customers', 'coupons', 'health'] as const) {
			if (route !== 'pos') await navigateToPage(page, route);
			if (route === 'health') await page.getByTestId('health-nav-logs').click();
			const collection = route === 'pos' ? 'products' : route === 'health' ? 'logs' : route;
			expectSearchResponsive(
				await measureSearch(page, `search-${collection}`, testInfo, `desktop-${route}`),
				route
			);
		}
	} finally {
		await app.close();
	}
});
