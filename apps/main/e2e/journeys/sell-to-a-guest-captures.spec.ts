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
	ensureSystemTheme,
} from '../capture-matrix';
import { getStoreUrl, getStoreVariant } from '../fixtures';
import { liveOrderTest as test } from '../order-lifecycle';
import { SELL_TO_A_GUEST, sellToAGuest } from './sell-to-a-guest';

test.skip(process.env.CAPTURES !== '1', 'J2 captures run only with CAPTURES=1');

/** What each step's docs call-outs point at. A testID not on screen is left out of the manifest. */
const PINS_BY_STEP: Record<number, readonly string[]> = {
	1: ['search-products', 'cart-customer-name'],
	2: ['cart-quantity-input'],
	3: ['cart-quantity-input', 'checkout-button'],
	4: ['checkout-tender-pane', 'checkout-dialog'],
	5: ['checkout-entry', 'checkout-commit'],
	6: ['receipt-paid-banner'],
	7: ['cart-customer-name'],
};

/** Whether the scale style tag `applyScale` adds is still in the document. */
function hasScaleStyle(page: Page): Promise<boolean> {
	return page.evaluate(() =>
		Array.from(document.querySelectorAll('style')).some((style) =>
			style.textContent?.startsWith(':root, [style*="--spacing:"]')
		)
	);
}

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
					test.setTimeout(300_000);
					await ensureSystemTheme(posPage, { english: true });
					let unscale = await applyScale(posPage, step);
					let cashEntryShot = false;
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
					} finally {
						await unscale();
					}
				});
			});
		}
	}
}
