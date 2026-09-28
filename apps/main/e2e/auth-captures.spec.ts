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
	// A file in the test's output dir survives a pass; an in-memory attachment does not.
	// The output dir's name truncates the describe title, so the file carries the combination.
	const combo = info.titlePath.find((title) => /^(tablet|phone)-/.test(title)) ?? 'unknown';
	const path = info.outputPath(`${combo}--${state}.png`);
	await page.screenshot({ path, fullPage: true });
	await info.attach(`connect-captures-${state}`, { path, contentType: 'image/png' });
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
					// A live session is redirected off the auth routes, so sign out through
					// the cashier sheet: the connect screen then shows the saved site first.
					// The phone layout mounts two register bars; only one is on screen.
					await page
						.getByTestId('register-bar-avatar')
						.locator('visible=true')
						.first()
						.click({ timeout: 60_000 });
					await page.getByTestId('user-sheet-sign-out').click({ timeout: 60_000 });
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
