import { type ScaleStep, scaleVariables } from '@wcpos/components/lib/scale';

import {
	getStoreUrl,
	getStoreVariant,
	hydrateAuthenticatedPage,
	stubStoreVersionForE2E,
} from './fixtures';
import { expect, test } from './test';

import type { Page, TestInfo } from '@playwright/test';

// No captures project exists yet; opt in without adding a runtime app switch.
test.skip(process.env.CAPTURES !== '1', 'Connect captures run only with CAPTURES=1');

async function capture(page: Page, info: TestInfo, state: string, step: ScaleStep) {
	// Auth has no store scale override. Scope the same seven production tokens
	// to the existing provider (and portals), rather than approximating with zoom.
	const tokens = Object.entries(scaleVariables(step, 'coarse'))
		.map(([name, value]) => `${name}: ${value}px !important;`)
		.join('');
	const style = await page.addStyleTag({ content: `:root, [style*="--spacing:"] { ${tokens} }` });
	await info.attach(`connect-captures-${state}`, {
		body: await page.screenshot({ fullPage: true }),
		contentType: 'image/png',
	});
	await style.evaluate((element) => element.parentNode?.removeChild(element));
}

for (const [device, viewport] of Object.entries({
	tablet: { width: 1024, height: 768 },
	phone: { width: 390, height: 844 },
})) {
	for (const colorScheme of ['light', 'dark'] as const) {
		for (const step of ['compact', 'regular', 'spacious'] as const) {
			test.describe(`${device}-${colorScheme}-${step}`, () => {
				test.use({ viewport, colorScheme, hasTouch: true });
				test('first run, typing and discovery error', async ({ page }, info) => {
					await stubStoreVersionForE2E(page.context(), getStoreUrl(info), getStoreVariant(info));
					await page.goto('/');
					await expect(page.getByTestId('store-url-input')).toBeVisible({ timeout: 60_000 });
					await capture(page, info, 'first-run', step);
					await page.getByTestId('store-url-input').fill('https://example.com');
					await capture(page, info, 'typing', step);
					await page.getByTestId('connect-store-button').click();
					await expect(page.getByTestId('connect-error-message')).toBeVisible({ timeout: 60_000 });
					await capture(page, info, 'discovery-error', step);
				});
				test('saved account, store selection and Open POS', async ({ page }, info) => {
					await hydrateAuthenticatedPage(page, info, { waitForCatalogue: false });
					// Use the existing theme UI so navigation's inline background changes too.
					await page.goto('/settings/theme');
					const themeScreen = page.getByTestId('screen-settings-theme');
					await expect(themeScreen).toBeVisible({ timeout: 60_000 });
					// Theme cards are ordered System, Light, Dark; no translated selector.
					const themeCard = themeScreen
						.locator('[aria-selected]')
						.nth(colorScheme === 'light' ? 1 : 2);
					await themeCard.click();
					await expect(themeCard).toHaveAttribute('aria-selected', 'true');
					await page.goto('/');
					await page.getByTestId('user-menu-trigger').click();
					// Logout is the final item in this menu and has no testID.
					await page.getByRole('menuitem').last().click();
					await expect(page.getByTestId('wp-user-button').first()).toBeVisible({ timeout: 60_000 });
					await capture(page, info, 'one-site-with-users', step);
					await page.getByTestId('wp-user-button').first().click();
					await expect(page.getByTestId(/^store-option-/).first()).toBeVisible({ timeout: 60_000 });
					await capture(page, info, 'selected-user-with-stores', step);
					await page
						.getByTestId(/^store-option-/)
						.first()
						.click();
					await expect(page.getByTestId('open-pos-button')).toBeEnabled({ timeout: 60_000 });
					await capture(page, info, 'open-pos-enabled', step);
				});
				test('demo', async ({ page }, info) => {
					await page.goto('/');
					await page.getByTestId('enter-demo-store-button').click({ timeout: 60_000 });
					await expect(page.getByTestId('wp-user-button').first()).toBeVisible({ timeout: 90_000 });
					await capture(page, info, 'demo', step);
				});
			});
		}
	}
}
