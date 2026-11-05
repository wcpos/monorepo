/**
 * roadmap#514: J2 "Sell to a guest" captured at every step, at the register captures' matrix.
 * The captures are the screenshots for `pos/checkout/index.mdx`, taken by walking the journey
 * module itself, so the docs show the walk the J2 spec proves.
 */
import { expect, type Page } from '@playwright/test';

import { readPins, recordCapture } from '../capture-manifest';
import {
	applyScale,
	CAPTURE_DEVICES,
	CAPTURE_SCHEMES,
	CAPTURE_STEPS,
	captureViewport,
	cleanUp,
	ensureSystemTheme,
	hasScaleStyle,
} from '../capture-matrix';
import { getStoreUrl, getStoreVariant } from '../fixtures';
import { liveOrderTest as test } from '../order-lifecycle';
import { closeRegister, openRegister } from './open-register';
import { SELL_TO_A_GUEST, sellToAGuest } from './sell-to-a-guest';

test.skip(process.env.CAPTURES !== '1', 'J2 captures run only with CAPTURES=1');
// `recordCapture` read-modifies-writes one manifest per page and locale, and this file runs under
// `fullyParallel`, so serial is what makes that safe; one `--project` per run.
test.describe.configure({ mode: 'serial' });

/** What each step's docs call-outs point at. A testID not on screen is left out of the manifest. */
const PINS_BY_STEP: Record<number, readonly string[]> = {
	1: ['search-products', 'cart-customer-name'],
	2: ['cart-quantity-input'],
	3: [
		'register-bar-place',
		'search-products',
		'pos-products-grid-scroller',
		'open-order-strip',
		'cart-customer-name',
		'cart-quantity-input',
		'add-cart-item-menu',
		'cart-subtotal',
		'checkout-button',
	],
	4: ['checkout-tender-pane', 'checkout-dialog'],
	5: [
		'checkout-tab-payments',
		'checkout-tab-legacy',
		'checkout-balance',
		'checkout-split-chip',
		'checkout-method-pos_cash',
		'checkout-quick-exact',
		'checkout-keypad',
		'checkout-commit',
	],
	6: [
		'receipt-change-due',
		'receipt-paid-with',
		'receipt-template-select',
		'receipt-printer-select',
		'receipt-preview',
		'receipt-print-button',
		'receipt-email-button',
		'receipt-new-sale',
	],
	7: ['cart-customer-name'],
};

// The docs page shows these steps' tablet shots fully labelled and numbers its legend from the
// manifest's pin order, so a missing pin would silently move every later number onto the wrong label.
const LABELLED_STEPS = [3, 5, 6];

/** Docs shots come only from demo; dev stores differ (no register bar, their own receipt templates). */
const DOCS_STORE = 'demo.wcpos.com';

/** Step 6 waits for the receipt to finish drawing; a store with no receipt to draw counts as drawn. */
async function receiptDrawn(page: Page): Promise<void> {
	if (!(await page.getByTestId('checkout-receipt-stage').isVisible())) return;
	await expect(page.getByTestId('receipt-preview-loading')).toBeHidden({ timeout: 60_000 });
	// The web WebView puts the testID on the iframe itself.
	const frame = page.getByTestId('receipt-preview-frame');
	await expect(frame.or(page.getByTestId('receipt-unavailable'))).toBeVisible({ timeout: 60_000 });
	if (!(await frame.isVisible())) return;
	await expect(frame.contentFrame().locator('body')).toHaveText(/\S/, { timeout: 60_000 });
}

for (const [device, viewport] of Object.entries(CAPTURE_DEVICES)) {
	for (const colorScheme of CAPTURE_SCHEMES) {
		for (const step of CAPTURE_STEPS) {
			test.describe(`${device}-${colorScheme}-${step}`, () => {
				test.use({ viewport, colorScheme, hasTouch: true });
				test('sell to a guest, every step', async ({
					posPage,
					request,
					storeAuthorization,
					trackOrder,
				}, info) => {
					// The walk, plus putting the register, theme and language back on the shared store.
					test.setTimeout(420_000);
					const restoreSettings = await ensureSystemTheme(posPage, { english: true });
					let opened = false;
					let walked = false;
					let unscale = async () => {};
					let cashEntryShot = false;
					const docsShoot = (process.env.E2E_STORE_URL_PRO ?? '').includes(DOCS_STORE);
					const shoot = async (number: number, slug: string): Promise<void> => {
						// A navigation or reload drops the added style tag; re-scale before the shot.
						if (!(await hasScaleStyle(posPage))) {
							console.log(`[rescale] ${info.titlePath.at(-2)}: before j2-${number}-${slug}`);
							unscale = await applyScale(posPage, step);
						}
						// A toast covers the header in the shot; wait for every one to leave.
						await expect(posPage.getByTestId('success-toast')).toHaveCount(0, {
							timeout: 15_000,
						});
						const state = `j2-${number}-${slug}`;
						const imagePath = await captureViewport(posPage, info, 'j2', state);
						// Straight after the shot, before anything else moves the page.
						const pins = await readPins(posPage, PINS_BY_STEP[number]);
						const pinned = pins.map((pin) => pin.testID);
						const missing = PINS_BY_STEP[number].filter((id) => !pinned.includes(id));
						if (
							docsShoot &&
							device === 'tablet' &&
							LABELLED_STEPS.includes(number) &&
							missing.length > 0
						) {
							throw new Error(`${state} is a labelled shot missing pins: ${missing.join(', ')}`);
						}
						if (docsShoot && number === 6) {
							const warning = `${state} would show the thermal printer warning; the docs must not`;
							await expect(posPage.getByTestId('receipt-printer-mismatch'), warning).toHaveCount(0);
						}
						recordCapture({
							journey: SELL_TO_A_GUEST.key,
							docsPage: SELL_TO_A_GUEST.docsPage,
							locale: 'en',
							outputDir: info.project.outputDir,
							imagePath,
							entry: {
								step: number,
								slug,
								device,
								colorScheme,
								scale: step,
								store: new URL(getStoreUrl(info)).hostname,
								variant: getStoreVariant(info),
								viewport,
								pins,
							},
						});
					};
					try {
						opened = await openRegister(posPage);
						console.log(`[register] ${info.titlePath.at(-2)}: opened=${opened}`);
						unscale = await applyScale(posPage, step);
						await sellToAGuest({
							page: posPage,
							request,
							testInfo: info,
							storeAuthorization,
							trackOrder,
							// The docs page shows change, so the shots tender more than the balance.
							tender: 'over',
							// Demo has no shared SKU, and a shot does not care which product sells.
							anyProduct: true,
							onCheckpoint: async ({ number, slug }, id) => {
								if (id === 'cash-entry') {
									cashEntryShot = true;
									await shoot(number, slug);
									return;
								}
								// A tender walk shot step 5 at the cash entry; a legacy walk has none.
								if (number === 5 && cashEntryShot) return;
								if (number === 6) await receiptDrawn(posPage);
								await shoot(number, slug);
							},
						});
						walked = true;
					} finally {
						await cleanUp(walked, [
							[
								'backToPos',
								async () => {
									if (walked) return;
									await posPage.goto('/');
									await expect(posPage.getByTestId('search-products').first()).toBeVisible({
										timeout: 60_000,
									});
								},
							],
							['unscale', unscale],
							['closeRegister', async () => opened && closeRegister(posPage)],
							['restoreSettings', restoreSettings],
						]);
					}
				});
			});
		}
	}
}
