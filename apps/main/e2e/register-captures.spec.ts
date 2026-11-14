import {
	applyScale,
	CAPTURE_DEVICES,
	CAPTURE_SCHEMES,
	CAPTURE_STEPS,
	captureViewport,
	ensureSystemTheme,
	SETTLE_MS,
} from './capture-matrix';
import { fetchDescriptors, readAmountMinor } from './checkout-shared';
import {
	becomesVisible,
	captureStoreAuthorization,
	ensureRegisterOpen,
	hydrateAuthenticatedPage,
	openOrderSheet,
	setVariationsStyle,
	tryAddProductBySku,
} from './fixtures';
import { ensureGridView, ensureTableView } from './pos-view-mode';
import { expect, test } from './test';

import type { Page, TestInfo } from '@playwright/test';

// Closed register, counting, overdue, closure, offline, terminal moment and twelve
// open orders: captured at the live review (these require dedicated fixtures).
test.skip(process.env.CAPTURES !== '1', 'Register captures run only with CAPTURES=1');

async function capture(page: Page, info: TestInfo, state: string, settle: number = SETTLE_MS) {
	await captureViewport(page, info, 'register-captures', state, settle);
	const header = page.getByTestId('checkout-ledger-header');
	return (await header.isVisible()) ? (await header.boundingBox())?.y : undefined;
}

for (const [device, viewport] of Object.entries(CAPTURE_DEVICES)) {
	for (const colorScheme of CAPTURE_SCHEMES) {
		for (const step of CAPTURE_STEPS) {
			test.describe(`${device}-${colorScheme}-${step}`, () => {
				test.use({ viewport, colorScheme, hasTouch: true });
				test('reachable register states', async ({ page }, info) => {
					test.setTimeout(300_000);
					page.setDefaultTimeout(15_000);
					const authorization = captureStoreAuthorization(page);
					const skip = (description: string) => {
						// The line reporter prints no annotations; the log carries every skipped state.
						console.log(`[skip-state] ${info.titlePath.at(-2)}: ${description}`);
						info.annotations.push({ type: 'skip-state', description });
					};
					let headerY: number | undefined;
					const header = page.getByTestId('checkout-ledger-header');
					const checkHeader = (state: string, y: number | undefined) => {
						// Source mismatch: this id is mounted only for checkout/receipt, not cart.
						if (y === undefined) {
							skip(`${state}: checkout-ledger-header not mounted/visible at ${viewport.width}px`);
							return;
						}
						if (headerY === undefined) headerY = y;
						expect(y, `${state}: ledger header y at ${viewport.width}px`).toBe(headerY);
					};
					const state = async (
						name: string,
						enter: () => Promise<void>,
						leave?: () => Promise<void>,
						settle?: number
					) => {
						let captured = false;
						let y: number | undefined;
						const unscale = await applyScale(page, step);
						try {
							await enter();
							y = await capture(page, info, name, settle);
							captured = true;
						} catch (error) {
							skip(`${name}: ${error instanceof Error ? error.message : String(error)}`);
							// What the screen showed when the state could not be reached: the run's
							// diagnosis, not a capture (the board builder ignores `--skipped`).
							const path = info.outputPath(`${name}--skipped.png`);
							await page.screenshot({ path }).catch(() => undefined);
							await info.attach(`skipped-${name}`, { path, contentType: 'image/png' });
						} finally {
							await unscale();
							if (leave)
								await leave().catch((error: unknown) => skip(`${name} cleanup: ${String(error)}`));
						}
						// Geometry failures must fail, not be swallowed as unavailable states.
						if (captured) checkHeader(name, y);
						return captured;
					};
					const cart = async () => {
						const tab = page.getByTestId('pos-tab-cart');
						if (await tab.isVisible()) await tab.click();
					};
					const products = async () => {
						const tab = page.getByTestId('pos-tab-products');
						if (await tab.isVisible()) await tab.click();
					};
					const escape = async () => {
						await page.keyboard.press('Escape');
					};
					// The tender's × is the column's `checkout-close` on wide; on the phone the tender is a
					// modal route whose header close carries no id, and the browser's back leaves it.
					const closeTender = async () => {
						const close = page.getByTestId('checkout-close');
						if (await becomesVisible(close, 2_000)) await close.click();
						else await page.goBack();
					};
					// The settings dialogs (the shared UISettingsDialog) close through their footer Close.
					const closeSettings = async () => {
						// Forced: the toast host intercepts pointer events for a while after any toast.
						await page.getByTestId('ui-settings-close').click({ force: true });
						await expect(page.getByTestId('ui-settings-close')).toBeHidden();
					};
					try {
						await hydrateAuthenticatedPage(page, info);
						await ensureSystemTheme(page);
						await cart();
						await ensureRegisterOpen(page);
					} catch (error) {
						skip(`register bootstrap unavailable: ${String(error)}`);
						return;
					}
					await state('session-open-empty-cart', async () => {
						await page.getByTestId('new-order-tab').click();
						await expect(page.getByTestId('cart-line-total')).toHaveCount(0);
					});
					await state(
						'line-just-added',
						async () => {
							await products();
							expect(await tryAddProductBySku(page)).toBe('added');
							// The beat is caught 100 ms after the add, with no settle wait.
							await page.waitForTimeout(100);
						},
						undefined,
						0
					);
					await state('cart-with-lines', async () => {
						await products();
						expect(await tryAddProductBySku(page)).toBe('added');
						await cart();
						await expect(page.getByTestId('cart-line-total').first()).toBeVisible();
					});
					await state(
						'line-strip-revealed',
						async () => {
							await page.getByTestId('cart-line-total').first().click();
							await expect(page.getByTestId('cart-line-remove').first()).toBeVisible();
						},
						async () => {
							// The total toggles the strip; Escape does not close it, and a slid row
							// leaves the quantity button under the products column for the next state.
							await page.getByTestId('cart-line-total').first().click();
							await page.waitForTimeout(400);
						}
					);
					await state(
						'quantity-keypad-open',
						async () => {
							await page.getByTestId('cart-quantity-input').first().click();
							await expect(page.getByTestId('keypad-key-done')).toBeVisible();
						},
						async () => {
							// Done commits the unchanged value; on the phone the numpad is a sheet Escape
							// does not dismiss, and its scrim would block every state after it.
							await page.getByTestId('keypad-key-done').click();
							await expect(page.getByTestId('keypad-key-done')).toBeHidden();
						}
					);
					await state('order-sheet-open', () => openOrderSheet(page), escape);
					// The tray (count + list) only exists once the open carts overflow the strip
					// (2026-10-09); a store with a few carts has no list to capture.
					if (await page.getByTestId('open-orders-count').isVisible()) {
						await state(
							'open-orders-list',
							async () => {
								await page.getByTestId('open-orders-count').click();
								await expect(page.getByTestId('open-orders-list')).toBeVisible();
							},
							async () => {
								await page.getByTestId('open-orders-close').click();
							}
						);
					}
					await state(
						'cart-settings',
						async () => {
							await page.getByTestId('cart-settings-button').click();
							await expect(page.getByTestId('ui-settings-close')).toBeVisible();
						},
						closeSettings
					);
					await state(
						'register-panel',
						async () => {
							// The one door (Paul, 2026-10-29): avatar, cashier sheet, In the drawer. Forced: the
							// phone mounts a register bar per tab, stacked at the same point, and the actionability
							// check refuses a click whose hit-test lands on the other bar's avatar.
							await page
								.getByTestId('register-bar-avatar')
								.locator('visible=true')
								.first()
								.click({ force: true });
							await page.getByTestId('user-sheet-drawer').click();
							await expect(page.getByTestId('register-panel')).toBeVisible();
						},
						escape
					);
					await state(
						'movement-sheet',
						async () => {
							// The one door (Paul, 2026-10-29): avatar, cashier sheet, In the drawer. Forced: the
							// phone mounts a register bar per tab, stacked at the same point, and the actionability
							// check refuses a click whose hit-test lands on the other bar's avatar.
							await page
								.getByTestId('register-bar-avatar')
								.locator('visible=true')
								.first()
								.click({ force: true });
							await page.getByTestId('user-sheet-drawer').click();
							await page.getByTestId('register-panel-paid-in').click();
							await expect(page.getByTestId('movement-amount')).toBeVisible();
						},
						async () => {
							await escape();
							await escape();
						}
					);
					await products();
					const search = page.getByTestId('search-products');
					await state(
						'products-no-results',
						async () => {
							await search.fill('zzzz-no-such-product');
							await expect(page.getByTestId('no-data-message')).toBeVisible();
						},
						async () => {
							await search.clear();
						}
					);
					await state(
						'products-settings',
						async () => {
							await page.getByTestId('products-settings-button').click();
							await expect(page.getByTestId('products-variations-style-inline')).toBeVisible();
						},
						closeSettings
					);
					// The first page of the catalogue is simple products; a variable one is searched for
					// (the WooCommerce sample data's Hoodie) and the search cleared afterwards.
					const findVariable = async (id: string) => {
						await search.fill('Hoodie');
						const hit = page.getByTestId(id).first();
						await expect(hit).toBeVisible({ timeout: 30_000 });
						return hit;
					};
					for (const view of ['table', 'grid'] as const) {
						await state(
							`variations-drill-in-${view}`,
							async () => {
								await setVariationsStyle(page, 'drill');
								await (view === 'table' ? ensureTableView(page) : ensureGridView(page));
								// The tile drills in itself; in the table the chevron beside the row does.
								const variable = await findVariable(
									view === 'grid' ? 'variable-product-tile' : 'variable-product-drill'
								);
								await variable.click();
								await expect(page.getByTestId('products-variations-pane')).toBeVisible();
								// Tiles drill into tiles; rows drill into rows.
								await expect(
									page
										.getByTestId(
											view === 'grid' ? /^variation-tile-/ : /^data-table-row-variation-/
										)
										.first()
								).toBeVisible({
									timeout: 15_000,
								});
							},
							async () => {
								const back = page.getByTestId('products-breadcrumb-back');
								if (await back.isVisible()) await back.click();
								await search.clear();
							}
						);
					}
					await state(
						'variation-popover-inline',
						async () => {
							await setVariationsStyle(page, 'inline');
							await ensureGridView(page);
							await (await findVariable('variable-product-tile')).click();
							await expect(page.getByRole('dialog').last()).toBeVisible();
						},
						async () => {
							await escape();
							await search.clear();
						}
					);
					await cart();
					// Every head reading goes through capture(): its scale tokens must apply to the
					// measurement as they do to the screenshot, or a scaled tender is compared with an
					// unscaled cart.
					// Every head reading is a scaled capture, like the states'.
					const scaledCapture = async (name: string) => {
						const unscale = await applyScale(page, step);
						try {
							return await capture(page, info, name);
						} finally {
							await unscale();
						}
					};
					// The store is shared: another run may have closed this register since the cart states.
					await ensureRegisterOpen(page);
					checkHeader('before-tender', await scaledCapture('before-tender'));
					const tender = await state('tender-keypad', async () => {
						await page.getByTestId('checkout-button').click();
						await expect(page.getByTestId('checkout-keypad')).toBeVisible({ timeout: 30_000 });
					});
					if (tender) {
						await state(
							'split-open',
							async () => {
								await page.getByTestId('checkout-split-chip').click();
								// The split view opens on Even: its way tiles carry the split option or share ids.
								await expect(
									page.getByTestId(/^checkout-split-(share|option)-/).first()
								).toBeVisible();
							},
							async () => {
								// With no plan chosen, × closes the split view and keeps the tender open.
								await closeTender();
								await expect(
									page.getByTestId(/^checkout-split-(share|option)-/).first()
								).toBeHidden();
							}
						);
						await closeTender();
						await cart();
						checkHeader('back-to-cart', await scaledCapture('back-to-cart'));
						await page.getByTestId('checkout-button').click();
						if (await becomesVisible(header, 5_000)) {
							const y = await scaledCapture('tender-again');
							checkHeader('tender-again', y);
						}
						await state('paid', async () => {
							const auth = authorization();
							if (!auth) throw new Error('No captured store authorization');
							const methods = await fetchDescriptors(page.request, info, auth);
							const cash = methods?.find(
								(method) =>
									method.kind === 'cash' && method.pos_enabled && method.capture?.mode === 'manual'
							);
							if (!cash) throw new Error('Store has no enabled manual cash tender');
							const balance = await readAmountMinor(page, 'checkout-balance');
							await page.getByTestId(`checkout-method-${cash.id}`).click();
							await page.getByTestId('checkout-keypad-key-clear').click();
							for (const digit of String(balance))
								await page.getByTestId(`checkout-keypad-key-${digit}`).click();
							await page.getByTestId('checkout-commit').click();
							await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({
								timeout: 60_000,
							});
						});
					} else {
						skip('split-open: tender unavailable');
						skip('paid: tender unavailable');
					}
				});
			});
		}
	}
}
