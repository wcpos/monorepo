/**
 * roadmap#540: J12 "Find a product" captured for `pos/product-panel/index.mdx`, by walking the
 * journey module itself. Steps 1 and 8 are the labelled shots; the others are there to choose from.
 *
 * Two combinations only, as J1's. The walk writes no product and voids its one cart line, so it
 * leaves nothing but, on demo, the closure of the docs register it opened.
 */
import { expect } from '@playwright/test';

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
import {
	type CheckpointId,
	DECLARED_GAP,
	FIND_A_PRODUCT,
	findAProduct,
	type JourneyStep,
	restoreProductPanel,
} from './find-a-product';
import { CLOSE_PUSH_TIMEOUT_MS, closeRegister } from './open-register';
import { REGISTER_PUSH_TIMEOUT_MS } from './open-the-register';

test.skip(process.env.CAPTURES !== '1', 'J12 captures run only with CAPTURES=1');
// `recordCapture` read-modifies-writes one manifest per page and locale: serial, one `--project`.
test.describe.configure({ mode: 'serial' });

/**
 * The one checkpoint each step is shot at, and what its docs call-outs point at. A testID not on
 * screen is left out of the manifest. Every other checkpoint fires no shot.
 */
const SHOTS: Record<number, { id: CheckpointId; pins: readonly string[] }> = {
	1: {
		id: 'done',
		pins: [
			'search-products',
			'products-settings-button',
			'view-mode-toggle',
			'filter-pill-stock_status',
			'filter-pill-featured',
			'filter-pill-on_sale',
			'filter-pill-categories',
			'product-tile',
			'data-table-count',
		],
	},
	2: { id: 'search-settled', pins: ['search-products', 'product-tile'] },
	3: { id: 'filter-on', pins: ['filter-pill-categories', 'filter-pill-remove-categories'] },
	4: { id: 'quick-filter-on', pins: ['filter-pill-on_sale'] },
	5: { id: 'rows', pins: ['view-mode-toggle', 'data-table-scroller-products'] },
	6: { id: 'browse-root', pins: ['products-breadcrumb', 'browse-root'] },
	7: { id: 'done', pins: ['cart-quantity-input', 'cart-subtotal'] },
	8: {
		id: 'variations',
		pins: [
			'products-breadcrumb',
			'products-breadcrumb-back',
			'variations-parent-tile',
			'variation-tile',
			'products-variations-pane',
		],
	},
};

// The docs page shows steps 1 and 8 fully labelled and numbers its legend from the manifest's pin
// order, so a missing pin would silently move every later number. Step 1 leaves out the count,
// which a store may not show on the grid.
const REQUIRED_PINS: Record<number, readonly string[]> = {
	1: SHOTS[1].pins.filter((id) => id !== 'data-table-count'),
	8: ['variations-parent-tile', 'variation-tile'],
};

/** Docs shots come only from demo. */
const DOCS_STORE = 'demo.wcpos.com';

const COMBINATIONS = [
	{ device: 'tablet', viewport: CAPTURE_DEVICES.tablet },
	{ device: 'phone', viewport: CAPTURE_DEVICES.phone },
] as const;

for (const { device, viewport } of COMBINATIONS) {
	test.describe(`${device}-light-regular`, () => {
		test.use({ viewport, colorScheme: 'light', hasTouch: true });
		test('find a product, every step', async ({ page, request, storeAuthorization }, info) => {
			// The walk, plus a register opened and closed on demo, and the theme and language put back.
			test.setTimeout(REGISTER_PUSH_TIMEOUT_MS + CLOSE_PUSH_TIMEOUT_MS + 360_000);
			const docsShoot = (process.env.E2E_STORE_URL_PRO ?? '').includes(DOCS_STORE);
			// Off demo the store has sessions off, so step 1's `openRegister` has nothing to open.
			await hydrateAuthenticatedPage(page, info, { waitForCatalogue: false });
			// The theme and language below belong to the store the app is on.
			if (docsShoot) await showStore(page, request, info, storeAuthorization);
			const restoreSettings = await ensureSystemTheme(page, { english: true });
			// Step 1's 'done' fired, so the register is open: observe-only, it only records that.
			let opened = false;
			let walked = false;
			let unscale = async () => {};
			const shoot = async (number: number, slug: string): Promise<void> => {
				// A navigation or reload drops the added style tag; re-scale before the shot.
				if (!(await hasScaleStyle(page))) {
					console.log(`[rescale] ${info.titlePath.at(-2)}: before j12-${number}-${slug}`);
					unscale = await applyScale(page, 'regular');
				}
				// A toast covers the panel in the shot; wait for every toast to leave.
				await expect(page.locator('[data-testid$="-toast"]')).toHaveCount(0, { timeout: 30_000 });
				const state = `j12-${number}-${slug}`;
				const imagePath = await captureViewport(page, info, 'j12', state);
				// Straight after the shot, before anything else moves the page.
				const pins = await readPins(page, SHOTS[number].pins);
				const pinned = pins.map((pin) => pin.testID);
				const missing = (REQUIRED_PINS[number] ?? []).filter((id) => !pinned.includes(id));
				if (docsShoot && device === 'tablet' && missing.length > 0) {
					throw new Error(`${state} is a labelled shot missing pins: ${missing.join(', ')}`);
				}
				const dropped = SHOTS[number].pins.filter((id) => !pinned.includes(id));
				console.log(
					`[pins] ${device} ${state}: ${pinned.join(', ')} | dropped: ${dropped.join(', ')}`
				);
				recordCapture({
					journey: FIND_A_PRODUCT.key,
					docsPage: FIND_A_PRODUCT.docsPage,
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
			/** Step 7's 'done' fires on a declared gap too; with no scan there is nothing to shoot. */
			const gapped = (number: number) =>
				info.annotations.some(
					(note) => note.type === DECLARED_GAP && note.description?.startsWith(`step ${number}:`)
				);
			const onCheckpoint = async ({ number, slug }: JourneyStep, id: CheckpointId) => {
				if (number === 1 && id === 'done') opened = true;
				if (SHOTS[number]?.id !== id || (number === 7 && gapped(7))) return;
				await shoot(number, slug);
			};
			try {
				// Demo's stores carry several registers; step 1 opens the one picked here.
				if (docsShoot) await pickDocsRegister(page, request, info, storeAuthorization);
				unscale = await applyScale(page, 'regular');
				await findAProduct({ page, request, testInfo: info, storeAuthorization, onCheckpoint });
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
					['restoreProductPanel', async () => walked || restoreProductPanel(page)],
					// The walk leaves the register open, so on demo it is closed after a good walk too.
					// A failed walk's cart line is voided only if step 9 ran; after a failed walk a close
					// that fails is only logged.
					['closeRegister', async () => docsShoot && opened && closeRegister(page)],
					// Step 9's void toast sits over a phone's hamburger, which the restore presses forced.
					[
						'toasts',
						() =>
							expect(page.locator('[data-testid$="-toast"]')).toHaveCount(0, { timeout: 30_000 }),
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
