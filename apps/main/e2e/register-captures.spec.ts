import { type ScaleStep, scaleVariables } from '@wcpos/components/lib/scale';

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

async function capture(page: Page, info: TestInfo, state: string, step: ScaleStep) {
	const tokens = Object.entries(scaleVariables(step, 'coarse'))
		.map(([name, value]) => `${name}: ${value}px !important;`)
		.join('');
	const style = await page.addStyleTag({ content: `:root, [style*="--spacing:"] { ${tokens} }` });
	try {
		const combo = info.titlePath.find((title) => /^(tablet|phone)-/.test(title)) ?? 'unknown';
		const path = info.outputPath(`${combo}--${state}.png`);
		await page.screenshot({ path, fullPage: true });
		await info.attach(`register-captures-${state}`, { path, contentType: 'image/png' });
		const header = page.getByTestId('checkout-ledger-header');
		return (await header.isVisible()) ? (await header.boundingBox())?.y : undefined;
	} finally {
		await style.evaluate((element) => element.parentNode?.removeChild(element));
	}
}

for (const [device, viewport] of Object.entries({
	tablet: { width: 1024, height: 768 },
	phone: { width: 390, height: 844 },
})) {
	for (const colorScheme of ['light', 'dark'] as const) {
		for (const step of ['compact', 'regular', 'spacious'] as const) {
			test.describe(`${device}-${colorScheme}-${step}`, () => {
				test.use({ viewport, colorScheme, hasTouch: true });
				test('reachable register states', async ({ page }, info) => {
					test.setTimeout(300_000);
					page.setDefaultTimeout(5_000);
					const authorization = captureStoreAuthorization(page);
					const skip = (description: string) =>
						info.annotations.push({ type: 'skip-state', description });
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
						leave?: () => Promise<void>
					) => {
						let captured = false;
						let y: number | undefined;
						try {
							await enter();
							y = await capture(page, info, name, step);
							captured = true;
						} catch (error) {
							skip(`${name}: ${error instanceof Error ? error.message : String(error)}`);
						} finally {
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
					try {
						await hydrateAuthenticatedPage(page, info);
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
					await state('line-just-added', async () => {
						await products();
						expect(await tryAddProductBySku(page)).toBe('added');
						await page.waitForTimeout(100);
						// On phones, the product add resolves on the Products tab; preserve that moment.
					});
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
						escape
					);
					await state(
						'quantity-keypad-open',
						async () => {
							await page.getByTestId('cart-quantity-input').first().click();
							await expect(page.getByTestId('numpad-done-button')).toBeVisible();
						},
						escape
					);
					await state('order-sheet-open', () => openOrderSheet(page), escape);
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
					await state(
						'cart-settings',
						async () => {
							await page.getByTestId('cart-settings-button').click();
							await expect(page.getByRole('dialog').last()).toBeVisible();
						},
						escape
					);
					await state(
						'register-panel',
						async () => {
							await page.getByTestId('register-bar-drawer').locator('visible=true').first().click();
							await expect(page.getByTestId('register-panel')).toBeVisible();
						},
						escape
					);
					await state(
						'movement-sheet',
						async () => {
							await page.getByTestId('register-bar-drawer').locator('visible=true').first().click();
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
						escape
					);
					for (const view of ['table', 'grid'] as const) {
						await state(
							`variations-drill-in-${view}`,
							async () => {
								await setVariationsStyle(page, 'drill');
								await (view === 'table' ? ensureTableView(page) : ensureGridView(page));
								const variable =
									view === 'grid'
										? page.getByTestId('variable-product-tile').first()
										: page
												.getByTestId(/^data-table-row-/)
												.filter({ hasNot: page.getByTestId('add-to-cart-button') })
												.first();
								await variable.click({ timeout: 5_000 });
								await expect(page.getByTestId('products-variations-pane')).toBeVisible();
								await expect(page.getByTestId(/^data-table-row-variation-/).first()).toBeVisible({
									timeout: 15_000,
								});
							},
							async () => {
								const back = page.getByTestId('products-breadcrumb-back');
								if (await back.isVisible()) await back.click();
							}
						);
					}
					await state(
						'variation-popover-inline',
						async () => {
							await setVariationsStyle(page, 'inline');
							await ensureGridView(page);
							await page.getByTestId('variable-product-tile').first().click({ timeout: 5_000 });
							await expect(page.getByRole('dialog').last()).toBeVisible();
						},
						escape
					);
					await cart();
					checkHeader(
						'before-tender',
						(await header.isVisible()) ? (await header.boundingBox())?.y : undefined
					);
					const tender = await state('tender-keypad', async () => {
						await page.getByTestId('checkout-button').click();
						await expect(page.getByTestId('checkout-keypad')).toBeVisible({ timeout: 30_000 });
					});
					if (tender) {
						await state(
							'split-open',
							async () => {
								await page.getByTestId('checkout-split-chip').click();
								await expect(page.getByTestId('checkout-split-none')).toBeVisible();
							},
							async () => {
								await page.getByTestId('checkout-split-none').click();
							}
						);
						await page.getByTestId('checkout-close').click();
						await cart();
						checkHeader(
							'back-to-cart',
							(await header.isVisible()) ? (await header.boundingBox())?.y : undefined
						);
						await page.getByTestId('checkout-button').click();
						if (await becomesVisible(header, 5_000)) {
							const y = await capture(page, info, 'tender-again', step);
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
							await page.getByTestId('checkout-key-clear').click();
							for (const digit of String(balance))
								await page.getByTestId(`checkout-key-${digit}`).click();
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
