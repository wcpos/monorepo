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

/** The app language every capture is shot in. */
const ENGLISH = 'en_US';

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
	// A tooltip opens on hover and on focus. The pointer stays where the walk last clicked, so park
	// it in a corner; focus can stay on a tooltip trigger, so blur that trigger, and nothing else.
	const size = page.viewportSize();
	if (size) await page.mouse.move(size.width - 1, size.height - 1);
	await page.evaluate(() => {
		const el = document.activeElement;
		if (!(el instanceof HTMLElement) || !el.dataset.state?.includes('open')) return;
		const described = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
		if (described.some((id) => document.getElementById(id)?.getAttribute('role') === 'tooltip')) {
			el.blur();
		}
	});
	await expect(page.locator('[role="tooltip"]')).toHaveCount(0, { timeout: 5_000 });
	// Viewport only: a full-page shot under `hasTouch` resets Chromium's touch emulation, so
	// `(pointer: fine)` flips to true for every later state and the phone renders as a table.
	await page.screenshot({ path });
	await info.attach(`${prefix}-${state}`, { path, contentType: 'image/png' });
	return path;
}

/** The theme whose tile the open theme screen marks selected. */
async function selectedTheme(page: Page): Promise<string> {
	const tile = page.locator('[data-testid^="theme-option-"][aria-selected="true"]');
	await expect(tile).toHaveCount(1, { timeout: 10_000 });
	return ((await tile.getAttribute('data-testid')) ?? '').replace('theme-option-', '');
}

/** The open General screen's language code: its label searched, and the row marked selected. */
async function selectedLanguage(page: Page): Promise<string> {
	const label = (await page.getByTestId('language-select').textContent())?.trim() ?? '';
	const combobox = await openLanguages(page, label);
	const row = combobox.locator('[data-testid^="language-select-option-"][aria-selected="true"]');
	await expect(row, `the list marks "${label}" selected`).toHaveCount(1, { timeout: 10_000 });
	const testId = (await row.getAttribute('data-testid')) ?? '';
	// Picking the selected row again closes the list (a phone's sheet ignores Escape), unchanged.
	await row.click();
	await expect(combobox).toBeHidden({ timeout: 10_000 });
	return testId.replace('language-select-option-', '');
}

async function openLanguages(page: Page, search: string) {
	await page.getByTestId('language-select').click();
	const combobox = page.getByTestId('language-select-content');
	await expect(combobox).toBeVisible({ timeout: 10_000 });
	await page.getByTestId('combobox-search').fill(search);
	return combobox;
}

/** `selectEnglishLanguage` for any code, in the open General screen's combobox. */
async function selectLanguage(page: Page, code: string): Promise<void> {
	const combobox = await openLanguages(page, code);
	const option = combobox.getByTestId(`language-select-option-${code}`);
	await expect(option).toBeVisible({ timeout: 10_000 });
	await option.click();
	await expect(combobox).toBeHidden({ timeout: 10_000 });
	await page.waitForTimeout(SETTLE_MS);
}

/**
 * The store's theme is persisted on its record (`store.theme`); a shared store may carry an
 * explicit light or dark choice, and only "System" lets the emulated colour scheme decide.
 * Set once per test through the theme settings page and return to the POS.
 * With `english`, the same visit also picks English on General, so no second trip is needed.
 * Resolves to `restore`, which puts back only what changed on the (shared) store, then reads
 * the screens again and throws unless they show what was found. No change, no screens opened.
 */
export async function ensureSystemTheme(
	page: Page,
	{ english = false }: { english?: boolean } = {}
): Promise<() => Promise<void>> {
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
	const openSettings = async () => {
		await openDrawer();
		await page.getByTestId('drawer-item-settings').click();
		// Wide opens General beside the list; the phone shows the list alone. The Theme entry is
		// the one element both render.
		await expect(page.getByTestId('settings-nav-theme')).toBeVisible({ timeout: 15_000 });
	};
	const openLeaf = async (leaf: 'theme' | 'general') => {
		await page.getByTestId(`settings-nav-${leaf}`).click();
		await expect(page.getByTestId(`screen-settings-${leaf}`)).toBeVisible({ timeout: 15_000 });
	};
	const pickTheme = async (theme: string) => {
		await page.getByTestId(`theme-option-${theme}`).click();
		await page.waitForTimeout(SETTLE_MS);
	};
	// The phone's settings leaf carries no menu, only the crumb back to the index, which has one.
	const goBack = async () => {
		const back = page.getByTestId('settings-navigation-back').locator('visible=true').first();
		if (await becomesVisible(back, 1_000)) await back.click();
	};
	const toPos = async () => {
		await openDrawer();
		await page.getByTestId('drawer-item-pos').click();
		await expect(page.getByTestId('search-products').first()).toBeVisible({ timeout: 30_000 });
	};

	await openSettings();
	await openLeaf('theme');
	const theme = await selectedTheme(page);
	await pickTheme('system');
	await goBack();
	let language = ENGLISH;
	if (english) {
		await openLeaf('general');
		language = await selectedLanguage(page);
		await selectLanguage(page, ENGLISH);
		await goBack();
	}
	await toPos();
	console.log(`[settings] found theme ${theme}, language ${english ? language : '(untouched)'}`);

	return async () => {
		if (theme === 'system' && language === ENGLISH) {
			console.log('[settings] nothing to restore');
			return;
		}
		await openSettings();
		if (theme !== 'system') {
			await openLeaf('theme');
			await pickTheme(theme);
			const now = await selectedTheme(page);
			if (now !== theme) throw new Error(`restore: the theme reads ${now}, not ${theme}`);
			await goBack();
		}
		if (language !== ENGLISH) {
			await openLeaf('general');
			await selectLanguage(page, language);
			const now = await selectedLanguage(page);
			if (now !== language) throw new Error(`restore: the language reads ${now}, not ${language}`);
			await goBack();
		}
		await toPos();
		console.log(`[settings] restored theme ${theme}, language ${language}`);
	};
}

/**
 * Every cleanup runs even when one before it fails. After a failed walk a cleanup failure is only
 * logged, so it never hides the walk's own error; after a passed walk the first one fails the test.
 */
export async function cleanUp(
	walked: boolean,
	steps: [string, () => Promise<unknown>][]
): Promise<void> {
	const failures: unknown[] = [];
	for (const [name, step] of steps) {
		await step().catch((error: unknown) => {
			if (walked) failures.push(error);
			else console.error(`[cleanup] ${name} failed after the walk failed:`, error);
		});
	}
	if (failures.length > 0) throw failures[0];
}

/** Whether the scale style tag `applyScale` adds is still in the document. */
export function hasScaleStyle(page: Page): Promise<boolean> {
	return page.evaluate(() =>
		Array.from(document.querySelectorAll('style')).some((style) =>
			style.textContent?.startsWith(':root, [style*="--spacing:"]')
		)
	);
}
