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
				// The app's theme setting defaults to System, so the emulated colour
				// scheme is the theme; no settings screen is driven.
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
					// The connect route with a saved site: the sites region first, the address folded.
					await page.goto('/connect');
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
			});
		}
	}
}
