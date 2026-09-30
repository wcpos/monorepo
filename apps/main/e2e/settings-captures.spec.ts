import { type ScaleStep, scaleVariables } from '@wcpos/components/lib/scale';

import { hydrateAuthenticatedPage } from './fixtures';
import { expect, test } from './test';

import type { Page, TestInfo } from '@playwright/test';

// Capture only reachable Settings states; never confirm a destructive action.
test.skip(process.env.CAPTURES !== '1', 'Settings captures run only with CAPTURES=1');
const SETTLE_MS = 350;

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
	// Viewport only: a full-page shot under `hasTouch` resets Chromium's touch emulation, so
	// `(pointer: fine)` flips to true for every later state and the phone renders as a table.
	await page.screenshot({ path });
	await info.attach(`settings-captures-${state}`, { path, contentType: 'image/png' });
}
async function openSettings(page: Page) {
	for (const id of ['orders-bar-menu', 'pos-drawer-open-button', 'drawer-open-button']) {
		const button = page.getByTestId(id).locator('visible=true').first();
		// The bar renders a beat after the page: give each candidate a second, as the register
		// captures do, instead of an instant isVisible() that misses it.
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
}

async function openSection(page: Page, section: string) {
	const nav = page.getByTestId(`settings-nav-${section}`);
	// On the phone the item lives on the index; give a page transition a moment before
	// concluding we are on a leaf and need the crumb (isVisible() answers at once).
	const onIndexOrRail = await nav
		.waitFor({ state: 'visible', timeout: 2_000 })
		.then(() => true)
		.catch(() => false);
	if (!onIndexOrRail) await page.getByTestId('settings-navigation-back').click();
	await nav.click();
	await expect(page.getByTestId(`screen-settings-${section}`)).toBeVisible();
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
					await openSection(page, 'theme');
					await page.getByTestId('theme-option-system').click();
					await expect(page.getByTestId('settings-saved-theme')).toBeVisible();
					await expect(page.getByTestId('settings-saved-theme')).toBeHidden();
					const state = async (
						name: string,
						enter: () => Promise<void>,
						leave?: () => Promise<void>,
						settle = SETTLE_MS
					) => {
						const unscale = await applyScale(page, step);
						try {
							await enter();
							if (device === 'phone' && name !== 'index') {
								await expect(page.getByTestId('settings-navigation-back')).toBeVisible();
							}
							await capture(page, info, name, settle);
						} finally {
							if (leave) await leave();
							await unscale();
						}
					};
					if (device === 'phone') {
						await state('index', async () => {
							await page.getByTestId('settings-navigation-back').click();
							await expect(page.getByTestId('screen-settings')).toBeVisible();
						});
					}
					await state('general', () => openSection(page, 'general'));
					const nameInput = page.getByTestId('screen-settings-general').locator('input').first();
					const originalName = await nameInput.inputValue();
					await state(
						'general-saved',
						async () => {
							// Typed, not filled: `fill` dispatches one synthetic input event that the form's
							// reactive `values` binding reverts before the debounced write fires.
							await nameInput.click();
							await nameInput.press('End');
							await page.keyboard.type(' capture', { delay: 30 });
							await expect(page.getByTestId('settings-saved-name')).toBeVisible();
						},
						async () => {
							await expect(page.getByTestId('settings-saved-name')).toBeHidden();
							await nameInput.click();
							await nameInput.press('End');
							for (let i = 0; i < ' capture'.length; i += 1) await nameInput.press('Backspace');
							await expect(page.getByTestId('settings-saved-name')).toBeVisible();
							await expect(page.getByTestId('settings-saved-name')).toBeHidden();
						},
						0
					);
					await state(
						'general-restore',
						async () => {
							await page.getByTestId('settings-general-restore-server').click();
							await expect(page.getByTestId('settings-general-restore-confirm')).toBeVisible();
						},
						() => page.getByTestId('settings-general-restore-cancel').click()
					);
					await state('tax', () => openSection(page, 'tax'));
					// The printers list waits up to 2 s for cloud printers before it renders anything
					// (never an empty-state flash), so this state settles past that window.
					await state('printing', () => openSection(page, 'printing'), undefined, 2_500);
					let deleteCaptured = false;
					const menus = page.getByTestId(/^printer-row-.*-menu$/);
					for (const menu of await menus.all()) {
						await menu.click();
						const remove = page.getByTestId(/^printer-row-.*-delete$/);
						if (await remove.isVisible()) {
							await state(
								'printing-delete',
								async () => {
									await remove.click();
									await expect(page.getByTestId(/^printer-row-.*-delete-confirm$/)).toBeVisible();
								},
								() => page.getByTestId(/^printer-row-.*-delete-cancel$/).click()
							);
							deleteCaptured = true;
							break;
						}
						await page.keyboard.press('Escape');
					}
					if (!deleteCaptured) {
						info.annotations.push({
							type: 'skip-state',
							description: 'printing-delete: no deletable printer in this store',
						});
					}
					for (const section of ['theme', 'barcode-scanning', 'customer-display']) {
						await state(section, () => openSection(page, section));
					}
				});
			});
		}
	}
}
