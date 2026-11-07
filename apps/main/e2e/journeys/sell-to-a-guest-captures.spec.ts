/**
 * roadmap#514: J2 "Sell to a guest" captured at every step, at the register captures' matrix.
 * The captures are the screenshots for `pos/checkout/index.mdx`, taken by walking the journey
 * module itself, so the docs show the walk the J2 spec proves.
 */
import {
	applyScale,
	CAPTURE_DEVICES,
	CAPTURE_SCHEMES,
	CAPTURE_STEPS,
	captureViewport,
	ensureSystemTheme,
} from '../capture-matrix';
import { liveOrderTest as test } from '../order-lifecycle';
import { sellToAGuest } from './sell-to-a-guest';

import type { Page } from '@playwright/test';

test.skip(process.env.CAPTURES !== '1', 'J2 captures run only with CAPTURES=1');

/** Whether the scale style tag `applyScale` adds is still in the document. */
function hasScaleStyle(page: Page): Promise<boolean> {
	return page.evaluate(() =>
		Array.from(document.querySelectorAll('style')).some((style) =>
			style.textContent?.startsWith(':root, [style*="--spacing:"]')
		)
	);
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
					await ensureSystemTheme(posPage);
					let unscale = await applyScale(posPage, step);
					try {
						await sellToAGuest({
							page: posPage,
							request,
							testInfo: info,
							storeAuthorization,
							trackOrder,
							onStep: async ({ number, slug }) => {
								// A navigation or reload drops the added style tag; re-scale before the shot.
								if (!(await hasScaleStyle(posPage))) {
									console.log(`[rescale] ${info.titlePath.at(-2)}: before j2-${number}-${slug}`);
									unscale = await applyScale(posPage, step);
								}
								await captureViewport(posPage, info, 'j2', `j2-${number}-${slug}`);
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
