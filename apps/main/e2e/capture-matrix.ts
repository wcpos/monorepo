/**
 * The capture matrix shared by the hand-run captures specs (`CAPTURES=1`): device viewports,
 * colour schemes and scale steps, the scale and theme setup, and the viewport capture itself.
 */
import { type ScaleStep, scaleVariables } from '@wcpos/components/lib/scale';

import { becomesVisible } from './fixtures';
import { expect } from './test';

import type { Page, TestInfo } from '@playwright/test';

// A capture shows a settled screen: entrances are over within PANE (280 ms) plus a frame.
export const SETTLE_MS = 350;

export const CAPTURE_DEVICES = {
	tablet: { width: 1024, height: 768 },
	phone: { width: 390, height: 844 },
};

export const CAPTURE_SCHEMES = ['light', 'dark'] as const;

export const CAPTURE_STEPS = ['compact', 'regular', 'spacious'] as const;

/**
 * The store has no scale override, so the step's nine production tokens are scoped to the
 * existing provider (and portals). Applied BEFORE a state is entered: layout the state measures
 * on entry (the strip's width, a sheet's box) must be the scaled layout, not a rescale of it.
 */
export async function applyScale(page: Page, step: ScaleStep): Promise<() => Promise<void>> {
	const tokens = Object.entries(scaleVariables(step, 'coarse'))
		.map(([name, value]) => `${name}: ${value}px !important;`)
		.join('');
	const style = await page.addStyleTag({ content: `:root, [style*="--spacing:"] { ${tokens} }` });
	return async () => {
		await style.evaluate((element) => element.parentNode?.removeChild(element)).catch(() => {});
	};
}

/**
 * Waits for the screen to settle, then shoots the viewport as `<combo>--<state>.png` (the combo
 * is the `device-scheme-step` describe title) and attaches it as `<prefix>-<state>`.
 */
export async function captureViewport(
	page: Page,
	info: TestInfo,
	prefix: string,
	state: string,
	settle: number = SETTLE_MS
): Promise<string> {
	if (settle) await page.waitForTimeout(settle);
	const combo = info.titlePath.find((title) => /^(tablet|phone)-/.test(title)) ?? 'unknown';
	const path = info.outputPath(`${combo}--${state}.png`);
	// Viewport only: a full-page shot under `hasTouch` resets Chromium's touch emulation, so
	// `(pointer: fine)` flips to true for every later state and the phone renders as a table.
	await page.screenshot({ path });
	await info.attach(`${prefix}-${state}`, { path, contentType: 'image/png' });
	return path;
}

/**
 * The store's theme is persisted on its record (`store.theme`); a shared store may carry an
 * explicit light or dark choice, and only "System" lets the emulated colour scheme decide.
 * Set once per test through the theme settings page and return to the POS.
 */
export async function ensureSystemTheme(page: Page) {
	// The phone keeps its navigation in the front drawer. Its items count as "visible" while
	// the closed drawer sits off-screen, so the hamburger decides: when one is on screen the
	// drawer must be opened first (forced, the bar is stacked per tab), and pressed only after
	// the slide ends.
	const openDrawer = async () => {
		// The POS screen's hamburger is the register bar's; the settings index's is its page bar's.
		for (const id of ['pos-drawer-open-button', 'settings-bar-menu']) {
			const hamburger = page.getByTestId(id).locator('visible=true').first();
			if (await becomesVisible(hamburger, 1_000)) {
				await hamburger.click({ force: true });
				await page.waitForTimeout(600);
				return;
			}
		}
	};
	const settings = page.getByTestId('drawer-item-settings');
	await openDrawer();
	await settings.click();
	// Wide opens General beside the list; the phone shows the list alone. The Theme entry is
	// the one element both render.
	await expect(page.getByTestId('settings-nav-theme')).toBeVisible({ timeout: 15_000 });
	await page.getByTestId('settings-nav-theme').click();
	await expect(page.getByTestId('screen-settings-theme')).toBeVisible({ timeout: 15_000 });
	await page.getByTestId('theme-option-system').click();
	await page.waitForTimeout(SETTLE_MS);
	// The phone's settings leaf carries no menu, only the crumb back to the index, which has one.
	const back = page.getByTestId('settings-navigation-back').locator('visible=true').first();
	if (await becomesVisible(back, 1_000)) await back.click();
	const pos = page.getByTestId('drawer-item-pos');
	await openDrawer();
	await pos.click();
	await expect(page.getByTestId('search-products').first()).toBeVisible({ timeout: 30_000 });
}
