import { type ScaleStep, scaleVariables } from '@wcpos/components/lib/scale';

import { hydrateAuthenticatedPage } from './fixtures';
import { mintSearchProbeToken } from './search-probe';
import { expect, test } from './test';

import type { Page, TestInfo } from '@playwright/test';

// Empty store, Free read-only, offline and failed load need dedicated live-review fixtures.
test.skip(process.env.CAPTURES !== '1', 'Products captures run only with CAPTURES=1');
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
	await page.screenshot({ path, fullPage: true });
	await info.attach(`products-captures-${state}`, { path, contentType: 'image/png' });
}
async function navigate(page: Page, route: 'settings' | 'products') {
	for (const id of ['products-bar-menu', 'pos-drawer-open-button', 'drawer-open-button']) {
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
	const item = page.getByTestId(`drawer-item-${route}`);
	await expect(item).toBeVisible({ timeout: 10_000 });
	await item.click();
}
async function ensureSystemTheme(page: Page) {
	await navigate(page, 'settings');
	await page.getByTestId('settings-nav-theme').click();
	await expect(page.getByTestId('screen-settings-theme')).toBeVisible();
	await page.getByTestId('theme-option-system').click();
	await navigate(page, 'products');
	await expect(page.getByTestId('search-products')).toBeVisible({ timeout: 30_000 });
}

for (const [device, viewport] of Object.entries({
	tablet: { width: 1024, height: 768 },
	phone: { width: 390, height: 844 },
})) {
	for (const colorScheme of ['light', 'dark'] as const) {
		for (const step of ['compact', 'regular', 'spacious'] as const) {
			test.describe(`${device}-${colorScheme}-${step}`, () => {
				// Tablet is the fine-pointer table for its hover/sort states; phone is the coarse row.
				test.use({ viewport, colorScheme, hasTouch: device === 'phone' });
				test('reachable products states', async ({ page }, info) => {
					test.setTimeout(240_000);
					page.setDefaultTimeout(15_000);
					await hydrateAuthenticatedPage(page, info);
					await ensureSystemTheme(page);
					const root = page.getByTestId('screen-products');
					const search = root.getByTestId('search-products');
					const skipState = (description: string) => {
						info.annotations.push({ type: 'skip-state', description });
					};
					const escape = async () => {
						await page.keyboard.press('Escape');
					};
					// Escape closes the topmost overlay on every device; on the phone the pane is a
					// dialog under the menu's sheet, so the caller re-checks the pane after a close.
					const closePopover = escape;
					const state = async (
						name: string,
						enter: () => Promise<void>,
						leave?: () => Promise<void>,
						settle = SETTLE_MS
					) => {
						const unscale = await applyScale(page, step);
						try {
							await enter();
							await capture(page, info, name, settle);
						} finally {
							if (leave) await leave();
							await unscale();
						}
					};
					await root.getByTestId('products-bar-display').click();
					await page.getByTestId('products-display-restore').click();
					await closePopover();
					await expect(
						root.getByTestId('data-table-count').or(root.getByTestId('no-data-message')).first()
					).toBeVisible({ timeout: 30_000 });
					await state('list', async () => {});
					const variable = root.locator('[data-testid^="products-row-"][aria-expanded="false"]');
					const expand =
						device === 'phone'
							? variable.first()
							: root.getByTestId('variable-product-expand').first();
					if (await expand.count()) {
						await state('variable-expanded', async () => {
							await expand.click();
							await expect(root.getByTestId(/^data-table-row-variation-/).first()).toBeVisible();
						});
						if (device === 'phone')
							await root
								.locator('[data-testid^="products-row-"][aria-expanded="true"]')
								.first()
								.click();
						else await expand.click();
					} else skipState('No resident variable product: inline expansion unavailable');
					await state('chip-set', async () => {
						await root.getByTestId('filter-pill-featured').click();
						await expect(root.getByTestId('filter-pill-remove-featured')).toBeVisible();
					});
					await state('clear-all-visible', async () => {
						await root.getByTestId('filter-pill-on_sale').click();
						await expect(root.getByTestId('products-filter-clear-all')).toBeVisible();
					});
					await root.getByTestId('products-filter-clear-all').click();
					await state(
						'display-options',
						async () => {
							await root.getByTestId('products-bar-display').click();
							await expect(page.getByTestId('products-display-options')).toBeVisible();
						},
						closePopover
					);
					// Throttle real requests, not app state. Resident data may settle without a network wait.
					const session = await page.context().newCDPSession(page);
					await session.send('Network.enable');
					await session.send('Network.emulateNetworkConditions', {
						offline: false,
						latency: 2_000,
						downloadThroughput: 32_768,
						uploadThroughput: 32_768,
					});
					try {
						const unscale = await applyScale(page, step);
						try {
							await search.fill(mintSearchProbeToken(info.workerIndex));
							const searching = root.getByTestId('products-searching-line');
							const reached = await searching.waitFor({ state: 'visible', timeout: 5_000 }).then(
								() => true,
								() => false
							);
							if (reached) await capture(page, info, 'searching', 0);
							else
								skipState(
									'Searching with retained rows settled before capture, or the active scope has no rows'
								);
						} finally {
							await unscale();
						}
					} finally {
						await session.send('Network.emulateNetworkConditions', {
							offline: false,
							latency: 0,
							downloadThroughput: -1,
							uploadThroughput: -1,
						});
					}
					await state('no-results', async () => {
						await expect(root.getByTestId('no-data-message')).toBeVisible({ timeout: 60_000 });
						await expect(root.getByTestId('data-table-loaded-count')).toHaveText('0');
					});
					await search.clear();
					await session.send('Network.emulateNetworkConditions', {
						offline: false,
						latency: 2_000,
						downloadThroughput: 32_768,
						uploadThroughput: 32_768,
					});
					// Reload discards style tags, so apply the same tokens via an init script before first paint.
					await page.addInitScript(
						({ tokens }) => {
							const style = document.createElement('style');
							style.textContent = tokens;
							document.addEventListener(
								'DOMContentLoaded',
								() => document.head.appendChild(style),
								{ once: true }
							);
						},
						{
							tokens: `:root, [style*="--spacing:"] { ${Object.entries(
								scaleVariables(step, 'coarse')
							)
								.map(([name, value]) => `${name}: ${value}px !important;`)
								.join('')} }`,
						}
					);
					try {
						await page.reload({ waitUntil: 'commit' });
						const skeleton = page
							.getByTestId('screen-products')
							.getByTestId(/^data-table-skeleton-/)
							.first();
						const reached = await skeleton.waitFor({ state: 'visible', timeout: 30_000 }).then(
							() => true,
							() => false
						);
						if (reached) await capture(page, info, 'loading', 0);
						else
							skipState(
								'Loading skeleton unavailable: persisted local products resolved without a network wait'
							);
					} finally {
						await session.send('Network.emulateNetworkConditions', {
							offline: false,
							latency: 0,
							downloadThroughput: -1,
							uploadThroughput: -1,
						});
						await session.detach();
					}
				});
			});
		}
	}
}
