import { type ScaleStep, scaleVariables } from '@wcpos/components/lib/scale';

import {
	CAPTURE_DEVICES,
	CAPTURE_SCHEMES,
	cleanUp,
	ensureSystemTheme as ensureCaptureSettings,
} from './capture-matrix';
import {
	becomesVisible,
	getStoreVariant,
	hydrateAuthenticatedPage,
	isRouteTeardownError,
	wcposRestRoute,
} from './fixtures';
import { mintSearchProbeToken } from './search-probe';
import { expect, test } from './test';

import type { Page, TestInfo } from '@playwright/test';

// Empty store, Free read-only, offline and failed load need dedicated live-review fixtures.
test.skip(process.env.CAPTURES !== '1', 'Orders captures run only with CAPTURES=1');
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
	await info.attach(`orders-captures-${state}`, { path, contentType: 'image/png' });
}
async function navigate(page: Page, route: 'settings' | 'orders' | 'pos') {
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
	const item = page.getByTestId(`drawer-item-${route}`);
	await expect(item).toBeVisible({ timeout: 10_000 });
	await item.click();
}
async function ensureSystemTheme(page: Page) {
	await navigate(page, 'settings');
	await page.getByTestId('settings-nav-theme').click();
	await expect(page.getByTestId('screen-settings-theme')).toBeVisible();
	await page.getByTestId('theme-option-system').click();
	await navigate(page, 'orders');
	await expect(page.getByTestId('search-orders')).toBeVisible({ timeout: 30_000 });
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
				test('reachable orders states', async ({ page }, info) => {
					test.setTimeout(240_000);
					page.setDefaultTimeout(15_000);
					await hydrateAuthenticatedPage(page, info);
					await ensureSystemTheme(page);
					const root = page.getByTestId('screen-orders');
					const search = root.getByTestId('search-orders');
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
					await root.getByTestId('orders-bar-display').click();
					await page.getByTestId('orders-display-restore').click();
					await closePopover();
					await expect(
						root.getByTestId('data-table-count').or(root.getByTestId('no-data-message')).first()
					).toBeVisible({ timeout: 30_000 });
					await state('list', async () => {});
					const rows = root.getByTestId(/^data-table-row-/);
					if (await rows.count()) {
						await state('date-day-headings', async () => {
							if (device === 'tablet') {
								await root.getByTestId('data-table-header-date_created_gmt').click();
							}
							await expect(root.getByTestId(/^orders-day-heading-/).first()).toBeVisible();
						});
						if (device === 'tablet') await state('row-hovered', () => rows.first().hover());
						await state('pane-open', async () => {
							await rows.first().click();
							await expect(page.getByTestId('order-modal')).toBeVisible();
							await expect(page.getByTestId('order-modal-close')).toBeVisible();
							// The order's actions are the modal's footer, not a ⋮ menu.
							await expect(page.getByTestId('order-modal-reopen')).toBeVisible();
						});
						if (device === 'phone') await state('pane-as-page', async () => {});
						const paneClose = page.getByTestId('order-modal-close');
						if (await paneClose.isVisible()) await paneClose.click();
					} else {
						skipState(
							'No orders in the active cashier/store scope: day headings, hover and pane states unavailable'
						);
					}
					await state('status-popover', async () => {
						await root.getByTestId('order-filter-status').click();
						await expect(page.getByTestId('order-filter-status-completed')).toBeVisible();
					});
					await page.getByTestId('order-filter-status-completed').click();
					await state('status-set', async () => {
						await expect(root.getByTestId('order-filter-status-remove')).toBeVisible();
					});
					await state('clear-all-visible', async () => {
						// The date popover opens on Today; Done applies it as the second filter group.
						await root.getByTestId('order-filter-date').click();
						await page.getByTestId('order-filter-date-done').click();
						await expect(root.getByTestId('orders-filter-clear-all')).toBeVisible();
					});
					await root.getByTestId('orders-filter-clear-all').click();
					await state(
						'date-popover',
						async () => {
							await root.getByTestId('order-filter-date').click();
							await expect(page.getByTestId('order-filter-date-popover')).toBeVisible();
						},
						closePopover
					);
					await state(
						'display-options',
						async () => {
							await root.getByTestId('orders-bar-display').click();
							await expect(page.getByTestId('orders-display-options')).toBeVisible();
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
							const searching = root.getByTestId('orders-searching-line');
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
							.getByTestId('screen-orders')
							.getByTestId(/^data-table-skeleton-/)
							.first();
						const reached = await skeleton.waitFor({ state: 'visible', timeout: 30_000 }).then(
							() => true,
							() => false
						);
						if (reached) await capture(page, info, 'loading', 0);
						else
							skipState(
								'Loading skeleton unavailable: persisted local orders resolved without a network wait'
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

/** Who may change a sale's cashier or store, and the plugin feature that records a cashier change. */
const REASSIGN_CAPABILITY = 'reassign_woocommerce_pos_sales';
const REASSIGN_FEATURE = 'order_cashier_reassignment';

/**
 * Passes one wcpos/v2 response through with its `capabilities` list edited (the body may be the
 * `_wcpos` envelope). Only the list changes: every other byte is the store's own answer.
 */
async function editCapabilities(
	page: Page,
	route: RegExp,
	edit: (list: string[] | undefined) => string[] | undefined
) {
	await page.route(
		(url) => route.test(wcposRestRoute(url.href) ?? ''),
		async (intercepted) => {
			try {
				const response = await intercepted.fetch();
				let body: Record<string, unknown>;
				try {
					body = await response.json();
				} catch {
					await intercepted.fulfill({ response });
					return;
				}
				const target = (body && '_wcpos' in body ? body.data : body) as {
					capabilities?: unknown;
				} | null;
				if (target && typeof target === 'object') {
					const list = Array.isArray(target.capabilities)
						? (target.capabilities as string[])
						: undefined;
					const edited = edit(list);
					if (edited) target.capabilities = edited;
				}
				await intercepted.fulfill({ response, json: body });
			} catch (error) {
				if (isRouteTeardownError(error)) return;
				console.warn('[orders-captures] capability route failed; aborting request:', error);
				await intercepted.abort().catch(() => {});
			}
		}
	);
}

/**
 * The Edit tab's Cashier and Store rows on a POS sale, editable and locked (PR #3706). Read only:
 * nothing is pressed, so nothing is written to the store.
 * - editable: the cashier's own `capabilities` gain `reassign_woocommerce_pos_sales` and the
 *   plugin's status gains `order_cashier_reassignment` (the dev stores run neither yet);
 * - locked: the status is the store's own and the cashier's list loses the capability.
 */
for (const [device, viewport] of Object.entries(CAPTURE_DEVICES)) {
	for (const colorScheme of CAPTURE_SCHEMES) {
		test.describe(`${device}-${colorScheme}-regular`, () => {
			test.use({ viewport, colorScheme, hasTouch: device === 'phone' });
			for (const editable of [true, false]) {
				const name = editable ? 'edit-identity-editable' : 'edit-identity-locked';
				test(`orders edit tab: cashier and store ${editable ? 'editable' : 'locked'}`, async ({
					page,
				}, info) => {
					test.skip(getStoreVariant(info) === 'free', 'The Orders page is Pro-only on Free');
					test.setTimeout(240_000);
					page.setDefaultTimeout(15_000);
					await hydrateAuthenticatedPage(page, info, {
						beforeBoot: async (booting) => {
							await editCapabilities(booting, /^\/wcpos\/v2\/cashier\/\d+$/, (list) =>
								list && editable
									? [...list, REASSIGN_CAPABILITY]
									: list?.filter((capability) => capability !== REASSIGN_CAPABILITY)
							);
							if (editable) {
								await editCapabilities(booting, /^\/wcpos\/v2\/status$/, (list) => [
									...(list ?? []),
									REASSIGN_FEATURE,
								]);
							}
						},
					});
					// System theme and English, put back afterwards; Orders is reached from the POS.
					const restore = await ensureCaptureSettings(page, { english: true });
					let walked = false;
					try {
						await navigate(page, 'orders');
						const root = page.getByTestId('screen-orders');
						await expect(
							root.getByTestId('data-table-count').or(root.getByTestId('no-data-message')).first()
						).toBeVisible({ timeout: 30_000 });
						// The first sale in scope with a cashier: an order created online has no Cashier row.
						const rows = root.getByTestId(/^data-table-row-/);
						const modal = page.getByTestId('order-modal');
						const cashierRow = modal.getByTestId('order-row-cashier');
						let found = false;
						for (let index = 0; index < Math.min(await rows.count(), 10) && !found; index++) {
							// On a fine pointer the caret is the row's one door; on touch the row is.
							const row = rows.nth(index);
							await (device === 'tablet' ? row.getByTestId('order-open-button') : row).click();
							await expect(modal).toBeVisible();
							// View, Edit, JSON: the Edit tab is the second.
							await modal.getByRole('tab').nth(1).click();
							found = await becomesVisible(cashierRow, 5_000);
							if (!found) await page.getByTestId('order-modal-close').click();
						}
						test.skip(!found, 'No POS sale (an order with a cashier) in the active scope');
						if (editable) {
							await expect(modal.getByTestId('order-edit-update-cashier')).toBeVisible({
								timeout: 30_000,
							});
							await expect(modal.getByTestId('order-edit-cashier')).toBeVisible();
						} else {
							await expect(cashierRow).toBeVisible();
							await expect(modal.getByTestId('order-edit-update-cashier')).toHaveCount(0);
							await expect(modal.getByTestId('order-edit-cashier')).toHaveCount(0);
						}
						const unscale = await applyScale(page, 'regular');
						try {
							await capture(page, info, name);
						} finally {
							await unscale();
						}
						await page.getByTestId('order-modal-close').click();
						await expect(modal).toBeHidden();
						// The restore opens Settings from the POS's own menu.
						await navigate(page, 'pos');
						await expect(page.getByTestId('search-products').first()).toBeVisible({
							timeout: 30_000,
						});
						// The drawer's close slide ends before the restore opens it again.
						await page.waitForTimeout(600);
						walked = true;
					} finally {
						await cleanUp(walked, [['settings', restore]]);
					}
				});
			}
		});
	}
}
