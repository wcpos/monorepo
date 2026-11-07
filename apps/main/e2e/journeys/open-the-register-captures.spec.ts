/**
 * roadmap#539: J1 "Open the register and run the session" captured at every step, for
 * `pos/register/index.mdx`, by walking the journey module itself.
 *
 * Two combinations only, never the whole matrix: on demo each walk leaves a real closure on a
 * real register, and the matrix would leave twelve. Anywhere else the register wire is stubbed
 * (`stubRegisterWire`), so the spec is proved without residue.
 */
import { expect } from '@playwright/test';

import { log } from '@wcpos/utils/logger';

import { readPins, recordCapture } from '../capture-manifest';
import {
	applyScale,
	CAPTURE_DEVICES,
	captureViewport,
	cleanUp,
	ensureSystemTheme,
	hasScaleStyle,
} from '../capture-matrix';
import {
	getStoreUrl,
	getStoreVariant,
	hydrateAuthenticatedPage,
	authenticatedTest as test,
} from '../fixtures';
import { pickDocsRegister, showStore } from './demo-register';
import { CLOSE_PUSH_TIMEOUT_MS, closeRegister } from './open-register';
import { OPEN_THE_REGISTER, openTheRegister, REGISTER_PUSH_TIMEOUT_MS } from './open-the-register';
import { stubRegisterWire } from './register-wire-stub';

test.skip(process.env.CAPTURES !== '1', 'J1 captures run only with CAPTURES=1');
// `recordCapture` read-modifies-writes one manifest per page and locale: serial, one `--project`.
test.describe.configure({ mode: 'serial' });

/** What each step's docs call-outs point at. A testID not on screen is left out of the manifest. */
const PINS_BY_STEP: Record<number, readonly string[]> = {
	1: [
		'register-bar-pill',
		'register-bar-place',
		'products-locked-notice',
		'open-register-amount',
		'open-register-chip-last',
		'open-register-chip-default',
		'open-register-button',
		'open-register-last-closure',
	],
	2: ['add-cart-item-menu'],
	3: [
		'user-sheet-drawer',
		'user-sheet-sales-today',
		'user-sheet-switch-user',
		'user-sheet-register-switch',
		'user-sheet-store-switch',
		'user-sheet-sign-out',
	],
	4: ['register-panel-drawer'],
	5: ['register-panel-drawer'],
	6: [
		'register-panel-drawer',
		'register-panel-session-sales',
		'register-panel-paid-in',
		'register-panel-paid-out',
		'register-panel-no-sale',
		'register-panel-float',
		'register-panel-movements',
		'register-panel-print',
		'register-panel-close-register',
	],
	7: ['count-amount', 'count-exact', 'count-close'],
	8: ['closure-title', 'closure-done'],
	9: ['open-register-card', 'open-register-last-closure'],
};

// The docs page shows these steps' tablet shots fully labelled and numbers its legend from the
// manifest's pin order, so a missing pin would silently move every later number. Step 1 requires
// only what every closed register shows: the chips and the last closure depend on the register's
// history, and the pill may be absent.
const REQUIRED_PINS: Record<number, readonly string[]> = {
	1: [
		'register-bar-place',
		'products-locked-notice',
		'open-register-amount',
		'open-register-button',
	],
	3: PINS_BY_STEP[3],
	6: PINS_BY_STEP[6],
};

/** Docs shots come only from demo; anywhere else the register wire is stubbed. */
const DOCS_STORE = 'demo.wcpos.com';

const COMBINATIONS = [
	{ device: 'tablet', viewport: CAPTURE_DEVICES.tablet },
	{ device: 'phone', viewport: CAPTURE_DEVICES.phone },
] as const;

for (const { device, viewport } of COMBINATIONS) {
	test.describe(`${device}-light-regular`, () => {
		test.use({ viewport, colorScheme: 'light', hasTouch: true });
		test('open the register, every step', async ({ page, request, storeAuthorization }, info) => {
			// The walk's two holds, plus the theme, language and register put back on the store.
			test.setTimeout(REGISTER_PUSH_TIMEOUT_MS + CLOSE_PUSH_TIMEOUT_MS + 360_000);
			const docsShoot = new URL(getStoreUrl(info)).hostname === DOCS_STORE;
			if (docsShoot) await hydrateAuthenticatedPage(page, info, { waitForCatalogue: false });
			else await stubRegisterWire(page, info);
			// The theme and language below belong to the store the app is on.
			if (docsShoot) await showStore(page, request, info, storeAuthorization);
			const restoreSettings = await ensureSystemTheme(page, { english: true });
			// The last step whose checkpoint fired: observe-only, it only records the number.
			let reached = 0;
			let walked = false;
			let unscale = async () => {};
			const shoot = async (number: number, slug: string): Promise<void> => {
				// A navigation or reload drops the added style tag; re-scale before the shot.
				if (!(await hasScaleStyle(page))) {
					log.info(`[rescale] ${info.titlePath.at(-2)}: before j1-${number}-${slug}`);
					unscale = await applyScale(page, 'regular');
				}
				// A movement's toast covers the panel in the shot; wait for every toast to leave.
				await expect(page.locator('[data-testid$="-toast"]')).toHaveCount(0, { timeout: 30_000 });
				const state = `j1-${number}-${slug}`;
				const imagePath = await captureViewport(page, info, 'j1', state);
				// Straight after the shot, before anything else moves the page.
				const pins = await readPins(page, PINS_BY_STEP[number]);
				const pinned = pins.map((pin) => pin.testID);
				const missing = (REQUIRED_PINS[number] ?? []).filter((id) => !pinned.includes(id));
				if (docsShoot && device === 'tablet' && missing.length > 0) {
					throw new Error(`${state} is a labelled shot missing pins: ${missing.join(', ')}`);
				}
				recordCapture({
					journey: OPEN_THE_REGISTER.key,
					docsPage: OPEN_THE_REGISTER.docsPage,
					locale: 'en',
					outputDir: info.project.outputDir,
					imagePath,
					entry: {
						step: number,
						slug,
						device,
						colorScheme: 'light',
						scale: 'regular',
						store: new URL(getStoreUrl(info)).hostname,
						variant: getStoreVariant(info),
						viewport,
						pins,
					},
				});
			};
			try {
				if (docsShoot) {
					await pickDocsRegister(page, request, info, storeAuthorization);
				}
				unscale = await applyScale(page, 'regular');
				await openTheRegister({
					page,
					testInfo: info,
					onCheckpoint: async ({ number, slug }) => {
						reached = number;
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
							await page.goto('/');
							await expect(page.getByTestId('search-products').first()).toBeVisible({
								timeout: 60_000,
							});
						},
					],
					// Step 2 can fail after the session opened, so the close runs from then on until step 8
					// lands the closure; on a register that never opened the close fails and is only
					// logged. The stub has nothing to close.
					[
						'closeRegister',
						async () => docsShoot && !walked && reached >= 1 && reached < 8 && closeRegister(page),
					],
					['unscale', () => unscale()],
					['restoreSettings', restoreSettings],
					// Routes stay armed after the walk; a late fetch would otherwise abort the run.
					['unroute', () => page.unrouteAll({ behavior: 'ignoreErrors' })],
				]);
			}
		});
	});
}
