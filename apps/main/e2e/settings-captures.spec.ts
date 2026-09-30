import { type ScaleStep, scaleVariables } from '@wcpos/components/lib/scale';

import { hydrateAuthenticatedPage } from './fixtures';
import { expect, test } from './test';

import type { Page, TestInfo } from '@playwright/test';

// Loading settles before a capture on a resident store; it is annotated, not faked.
test.skip(process.env.CAPTURES !== '1', 'Settings captures run only with CAPTURES=1');
const SETTLE_MS = 350;

type SettingsPage =
	'general' | 'tax' | 'printing' | 'customer-display' | 'barcode-scanning' | 'theme';

// Keep the register capture helper and naming contract: scale before entering each state.
async function applyScale(page: Page, step: ScaleStep): Promise<() => Promise<void>> {
	const tokens = Object.entries(scaleVariables(step, 'coarse'))
		.map(([name, value]) => `${name}: ${value}px !important;`)
		.join('');
	const style = await page.addStyleTag({ content: `:root, [style*="--spacing:"] { ${tokens} }` });
	return async () => {
		await style.evaluate((element) => element.parentNode?.removeChild(element)).catch(() => {});
	};
}
async function capture(page: Page, info: TestInfo, state: string, settle = SETTLE_MS) {
	if (settle) await page.waitForTimeout(settle);
	const combo = info.titlePath.find((title) => /^(tablet|phone)-/.test(title)) ?? 'unknown';
	const path = info.outputPath(`${combo}--${state}.png`);
	// Viewport only: a full-page shot under `hasTouch` resets Chromium's touch emulation.
	await page.screenshot({ path });
	await info.attach(`settings-captures-${state}`, { path, contentType: 'image/png' });
}
async function openSettings(page: Page) {
	for (const id of ['register-bar-menu', 'pos-drawer-open-button', 'drawer-open-button']) {
		const button = page.getByTestId(id).locator('visible=true').first();
		if (
			await button.waitFor({ state: 'visible', timeout: 1_000 }).then(
				() => true,
				() => false
			)
		) {
			await button.click({ force: true });
			await page.waitForTimeout(600);
			break;
		}
	}
	const item = page.getByTestId('drawer-item-settings');
	await expect(item).toBeVisible({ timeout: 10_000 });
	await item.click();
	await expect(page.getByTestId('settings-bar')).toBeVisible({ timeout: 30_000 });
}
// A phone leaf returns to the list through the bar's crumb; a tablet uses the rail.
async function openPage(page: Page, name: SettingsPage) {
	const back = page.getByTestId('settings-navigation-back');
	if (await back.isVisible()) await back.click();
	await page.getByTestId(`settings-nav-${name}`).click();
	await expect(page.getByTestId(`screen-settings-${name}`)).toBeVisible({ timeout: 30_000 });
}

for (const [device, viewport] of Object.entries({
	tablet: { width: 1024, height: 768 },
	phone: { width: 390, height: 844 },
})) {
	for (const colorScheme of ['light', 'dark'] as const) {
		for (const step of ['compact', 'regular', 'spacious'] as const) {
			test.describe(`${device}-${colorScheme}-${step}`, () => {
				test.use({ viewport, colorScheme, hasTouch: device === 'phone' });
				test('reachable settings states', async ({ page }, info) => {
					test.setTimeout(240_000);
					page.setDefaultTimeout(15_000);
					await hydrateAuthenticatedPage(page, info);
					await openSettings(page);
					const skipState = (description: string) => {
						info.annotations.push({ type: 'skip-state', description });
					};
					const state = async (
						name: string,
						enter: () => Promise<void>,
						leave?: () => Promise<void>
					) => {
						const unscale = await applyScale(page, step);
						try {
							await enter();
							await capture(page, info, name);
						} finally {
							if (leave) await leave();
							await unscale();
						}
					};

					// Colour comes from the emulated scheme: follow the system theme.
					await openPage(page, 'theme');
					await page.getByTestId('theme-option-system').click();

					if (device === 'phone') {
						await state('index', async () => {
							await page.getByTestId('settings-navigation-back').click();
							await expect(page.getByTestId('screen-settings')).toBeVisible();
						});
					} else skipState('The index is phone-only; wide sizes redirect to General');

					await state('general', () => openPage(page, 'general'));
					// Rewrite the store name with its own value plus a space: a local write that
					// shows the mark; the original is put back after the capture.
					const storeName = page.getByTestId('screen-settings-general').locator('input').first();
					const original = await storeName.inputValue();
					await state(
						'general-saved',
						async () => {
							await storeName.fill(`${original} `);
							await expect(page.getByTestId('settings-saved-name')).toBeVisible();
						},
						async () => {
							await storeName.fill(original);
						}
					);
					await state(
						'general-restore',
						async () => {
							await page.getByTestId('settings-general-restore-server').click();
							await expect(page.getByTestId('settings-general-restore-confirm')).toBeVisible();
						},
						() => page.getByTestId('settings-general-restore-cancel').click()
					);
					await state('tax', () => openPage(page, 'tax'));
					await state('printing', () => openPage(page, 'printing'));
					const menus = page.getByTestId(/^printer-row-.+-menu$/);
					let deleteShown = false;
					for (let index = 0; index < (await menus.count()) && !deleteShown; index++) {
						await menus.nth(index).click();
						const item = page.getByTestId(/^printer-row-.+-delete$/).first();
						if (await item.isVisible()) {
							await state(
								'printing-delete',
								async () => {
									await item.click();
									await expect(page.getByTestId(/-delete-cancel$/)).toBeVisible();
								},
								() => page.getByTestId(/-delete-cancel$/).click()
							);
							deleteShown = true;
						} else await page.keyboard.press('Escape');
					}
					if (!deleteShown) skipState('No deletable printer on this store');
					await state('theme', () => openPage(page, 'theme'));
					await state('barcode-scanning', () => openPage(page, 'barcode-scanning'));
					await state('customer-display', () => openPage(page, 'customer-display'));
					skipState('Loading settles before capture on a resident store');
				});
			});
		}
	}
}
