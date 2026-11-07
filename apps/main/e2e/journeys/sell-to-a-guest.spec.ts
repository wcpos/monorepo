/**
 * roadmap#514: J2 "Sell to a guest", walking `sell-to-a-guest.ts`, then J2's edge cases.
 * - phone New sale and drawer round trip supersedes `checkout-tender.spec.ts:703`
 * - keypad Done then Enter supersedes `pos-cart.spec.ts:113`
 * - keypad digits supersedes `pos-cart.spec.ts:135`
 * - closing checkout supersedes `pos-checkout.spec.ts:272`
 * - table-view add supersedes `products.spec.ts:119`
 * - five-add toast burst supersedes `pos-cart-toast-burst.spec.ts:37`
 * - read-only cart add timing supersedes `pos-cart.spec.ts:58` and `pos-cart.spec.ts:69`
 * - save ack with no payment link supersedes `pos-checkout.spec.ts:284`
 * - built-in POS gateway on the legacy webview supersedes `pos-checkout.spec.ts:538`
 * - standard, reduced and non-taxable per-line tax parity supersedes `pos-money-oracle.spec.ts:514`
 */
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

import { beginCartAddMeasurement, readCartAddMeasurement } from '../cart-add-timing';
import { checkoutProbeAddControl } from '../checkout-probe';
import {
	gatewaysResponse,
	isPaymentGatewaysUrl,
	omitPaymentLinkFromPushAcks,
} from '../checkout-route-stubs';
import {
	clickAndExpectPaymentWrite,
	decimalPlaces,
	digitsOf,
	ledgerRows,
	pollOrder,
	readAmountMinor,
} from '../checkout-shared';
import {
	getStoreUrl,
	getStoreVariant,
	isWcposRestRoute,
	tryAddProductBySku,
	waitForCadenceStart,
} from '../fixtures';
import { assertMixedTaxTreatment } from '../money-oracle-guards';
import {
	assertSaleParity,
	captureDivergenceLog,
	expectNoBanner,
	saveAndCapture,
	TAX_CLASS_SKU,
} from '../money-oracle-sale';
import {
	checkoutControl,
	expectOrderPaid,
	expectPaymentBlocked,
	newRunLabel,
	readOrder,
	type ServerOrder,
	stampRunLabel,
	liveOrderTest as test,
} from '../order-lifecycle';
import { ensureGridView, ensureTableView } from '../pos-view-mode';
import { resolveProbeAuthorization } from '../probe-credential';
import {
	addProduct,
	changeQuantity,
	checkOut,
	seePaid,
	sellToAGuest,
	type SellToAGuestContext,
	sharedProductTile,
	startGuestSale,
	startNextSale,
	takeCash,
} from './sell-to-a-guest';

/** The toast burst's tap count: step 2's add, then four more taps on the same product. */
const BURST_ADDS = 5;

/**
 * The G7 add budget, copied from `pos-cart.spec.ts` (it exports nothing). The gate is
 * quarantined, so here it only labels the reading and is never compared against.
 */
const CART_ADD_BUDGET_MS = 300;

/** What `elementFromPoint` finds at the control's centre: the control itself, or what covers it. */
// Copied from `pos-cart-toast-burst.spec.ts`, which #516 retires.
async function hitTarget(control: Locator) {
	return control.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
		return {
			landsOnControl: hit !== null && element.contains(hit),
			coveredBy: hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? hit?.tagName ?? null,
		};
	});
}

/** The four `liveOrderTest` fixtures a J2 test destructures, and the journey context from them. */
type Fixtures = Omit<SellToAGuestContext, 'page' | 'testInfo'> & { posPage: Page };
function journeyContext({ posPage, ...fixtures }: Fixtures, testInfo: TestInfo) {
	return { page: posPage, testInfo, ...fixtures } satisfies SellToAGuestContext;
}

/** Open the first line's quantity keypad; the popover renders no testID of its own. */
async function openQuantityKeypad(page: Page) {
	const quantityButton = page.getByTestId('cart-quantity-input').first();
	await expect(quantityButton).toBeVisible({ timeout: 15_000 });
	await quantityButton.click();
	// No testID exists on the quantity keypad popover (grow-keypad PopoverContent).
	const numpad = page.locator('[data-radix-popper-content-wrapper]').first();
	await expect(numpad).toBeVisible({ timeout: 15_000 });
	return { quantityButton, numpad };
}

test.describe('J2 Sell to a guest', () => {
	test('a cashier sells to a guest for cash', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		test.slow();
		const sale = await sellToAGuest(ctx);

		const authorization = await resolveProbeAuthorization(
			request,
			getStoreUrl(testInfo),
			storeAuthorization,
			{ route: '/wcpos/v2/orders' }
		);
		let server: ServerOrder;
		if (sale.mode === 'tender') {
			server = await pollOrder(
				request,
				testInfo,
				authorization,
				sale.orderId,
				(order) => ledgerRows(order).length === 1,
				'the server must record exactly one payment leg'
			);
			expectOrderPaid(server);
			const [row] = ledgerRows(server);
			expect(row.method_id, 'the leg must name the cash method that was tapped').toBe(
				sale.cashMethodId
			);
			expect(row.status, 'a manual cash leg is captured on the spot').toBe('captured');
			expect(Number(row.amount), 'the leg must equal the order total').toBeCloseTo(
				Number(server.total),
				2
			);
		} else {
			server = await readOrder(request, testInfo, authorization, sale.orderId);
			expectOrderPaid(server);
		}
		// Both sides in minor units at the cart's precision, so the decimal position counts.
		const serverMinor = digitsOf(Number(server.total).toFixed(decimalPlaces(sale.cartTotal)));
		expect(serverMinor, 'server total must equal the cart total').toBe(digitsOf(sale.cartTotal));
		const lines = server.line_items ?? [];
		expect(lines, 'the sale has one line').toHaveLength(1);
		expect(Number(lines[0].quantity), 'the line carries the keyed quantity').toBe(sale.quantity);
	});

	test('a cashier tenders more than the balance and change is due', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		test.slow();
		const amountOf = async (testId: string) =>
			Number(digitsOf((await posPage.getByTestId(testId).textContent()) ?? ''));
		let entryMinor = 0;
		const ctx: SellToAGuestContext = {
			...journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo),
			tender: 'over',
			onCheckpoint: async (_step, id) => {
				if (id === 'cash-entry') entryMinor = await amountOf('checkout-entry');
			},
		};
		const started = await startGuestSale(ctx);
		await addProduct(ctx, started);
		await changeQuantity(ctx, started);
		const sale = await checkOut(ctx, started);
		test.skip(sale.mode !== 'tender', 'a legacy store has no cash entry to tender over');
		await takeCash(ctx, sale);
		await seePaid(ctx, sale);
		expect(entryMinor, 'step 5 tendered more than the balance').toBeGreaterThan(sale.balanceMinor);
		// Drawn only when change is due: an exact tender fails here.
		await expect(posPage.getByTestId('receipt-change-due')).toBeVisible({ timeout: 15_000 });
		const changeMinor = await amountOf('receipt-change-due');
		expect(changeMinor, 'change is the tender less the balance').toBe(
			entryMinor - sale.balanceMinor
		);
		await startNextSale(ctx, sale);
	});

	test('a wrong item comes off the cart and Undo puts it back', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		const { page } = ctx;
		const started = await startGuestSale(ctx);
		await addProduct(ctx, started);
		await changeQuantity(ctx, started);
		// The line's total reveals its strip, as `register-captures.spec.ts` does.
		await page.getByTestId('cart-line-total').first().click();
		const remove = page.getByTestId('cart-line-remove').first();
		await expect(remove).toBeVisible({ timeout: 15_000 });
		await remove.click();
		await expect(page.getByTestId('cart-quantity-input')).toHaveCount(0, { timeout: 15_000 });
		// sonner's own attribute on the action button, never its label.
		const undo = page.getByTestId('success-toast').locator('[data-action]');
		await expect(undo).toBeVisible({ timeout: 15_000 });
		await undo.click();
		await expect(page.getByTestId('cart-quantity-input')).toHaveCount(1, { timeout: 15_000 });
		await expect(
			page.getByTestId('cart-quantity-input'),
			'the line comes back as it was'
		).toHaveText('3');
	});

	test('cash short of the balance leaves the rest due and the next payment finishes it', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		test.slow();
		const base = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		let keyedMinor = 0;
		const ctx: SellToAGuestContext = {
			...base,
			tender: 'short',
			onCheckpoint: async (_step, id) => {
				if (id === 'cash-entry') keyedMinor = await readAmountMinor(posPage, 'checkout-entry');
			},
		};
		const started = await startGuestSale(ctx);
		await addProduct(ctx, started);
		await changeQuantity(ctx, started);
		const sale = await checkOut(ctx, started);
		test.skip(sale.mode !== 'tender', 'a legacy store has no cash entry to tender short');
		await takeCash(ctx, sale);
		expect(keyedMinor, 'step 5 keyed less than the balance').toBeLessThan(sale.balanceMinor);
		expect(keyedMinor, 'step 5 keyed some cash').toBeGreaterThan(0);
		await expect(posPage.getByTestId('checkout-receipt-stage')).toBeHidden();
		await expect(posPage.getByTestId('checkout-tender-pane')).toBeVisible();
		// The claim: the next payment starts at what's left.
		const method = posPage.getByTestId(`checkout-method-${sale.cashMethodId}`);
		if (!(await posPage.getByTestId('checkout-entry').isVisible())) await method.click();
		await expect
			.poll(() => readAmountMinor(posPage, 'checkout-entry'), { timeout: 15_000 })
			.toBe(sale.balanceMinor - keyedMinor);
		await clickAndExpectPaymentWrite(posPage, 'checkout-commit', sale.orderId, 'record');
		// `base` is the exact-tender ctx: steps 6 and 7 run as the plain walk.
		await seePaid(base, sale);
		await startNextSale(base, sale);

		const authorization = await resolveProbeAuthorization(
			request,
			getStoreUrl(testInfo),
			storeAuthorization,
			{ route: '/wcpos/v2/orders' }
		);
		const server = await pollOrder(
			request,
			testInfo,
			authorization,
			sale.orderId,
			(order) => ledgerRows(order).length === 2,
			'the server must record two payment legs'
		);
		expectOrderPaid(server);
		const legs = ledgerRows(server).reduce((sum, row) => sum + Number(row.amount), 0);
		expect(legs, 'the two legs sum to the balance').toBeCloseTo(Number(server.total), 2);
	});

	test.describe('on a phone', () => {
		test.use({ viewport: { width: 390, height: 844 } });

		test('on a phone, New sale lands on Products and keeps it across a drawer round trip', async ({
			posPage,
			request,
			storeAuthorization,
			trackOrder,
		}, testInfo) => {
			const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
			test.slow();
			const { page } = ctx;
			test.skip(getStoreVariant(testInfo) !== 'pro', 'not a tender store');
			const drawerButton = page
				.getByTestId('pos-products-tab')
				.filter({ visible: true })
				.getByTestId('pos-drawer-open-button');
			await expect(drawerButton, 'the phone Products tab starts with its register bar').toBeVisible(
				{ timeout: 30_000 }
			);

			const sale = await sellToAGuest(ctx);
			test.skip(sale.mode !== 'tender', 'not a tender store');
			expect(sale.layout).toBe('phone');

			await expect(
				page.getByTestId('search-products').filter({ visible: true }),
				'#2363: New sale must land on the phone Products tab'
			).toBeVisible({ timeout: 30_000 });
			await expect(
				drawerButton,
				'#2363: after New sale the phone Products tab must keep its register bar drawer button'
			).toBeVisible({ timeout: 30_000 });
			await drawerButton.click();
			await expect(page.getByTestId('drawer-item-pos')).toBeVisible({ timeout: 15_000 });
			await page.getByTestId('drawer-item-orders').click();
			await expect(page.getByTestId('screen-orders')).toBeVisible({ timeout: 60_000 });
			await page.getByTestId('orders-bar-menu').filter({ visible: true }).click();
			await expect(page.getByTestId('drawer-item-pos')).toBeInViewport({ timeout: 15_000 });
			await page.getByTestId('drawer-item-pos').click();
			// On web the closed drawer stays in the DOM off-screen, so check the viewport.
			await expect(page.getByTestId('drawer-item-pos')).not.toBeInViewport({ timeout: 15_000 });
			await expect(
				page.getByTestId('search-products').filter({ visible: true }),
				'#2363: returning to POS through the drawer must keep the Products tab'
			).toBeVisible({ timeout: 60_000 });
		});
	});

	test("quantity keypad: Done, then a scanner's Enter, does not reopen it", async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		const { page } = ctx;
		await addProduct(ctx, await startGuestSale(ctx));

		const { quantityButton, numpad } = await openQuantityKeypad(page);
		await page.keyboard.type('3');
		await page.getByTestId('keypad-key-done').click();
		// A wedge scanner's Enter used to press the refocused quantity trigger and reopen the numpad
		// for the wrong row. The burst is below the store's minimum code length on purpose: it never
		// reaches the catalog; the assertion is only that the terminator did not act on the button.
		await expect(numpad).toBeHidden();
		await expect(quantityButton, 'Done commits the typed quantity').toHaveText('3', {
			timeout: 15_000,
		});
		await expect(quantityButton).toBeFocused();
		await page.keyboard.type('1234567');
		await page.keyboard.press('Enter');
		await expect(numpad).toBeHidden();
	});

	test('quantity keypad: the first digit replaces, later digits append', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		const { page } = ctx;
		await addProduct(ctx, await startGuestSale(ctx));

		const { quantityButton, numpad } = await openQuantityKeypad(page);
		// The keypad's first digit replaces the quantity and later digits append (decision 36).
		for (const digit of '123') await page.getByTestId(`keypad-key-${digit}`).click();
		await expect(page.getByTestId('quantity-keypad-value')).toHaveText('123');

		await page.getByTestId('keypad-key-done').click();
		await expect(numpad).toBeHidden();
		await expect(quantityButton).toHaveText(/123/, { timeout: 15_000 });
	});

	test('closing checkout returns to the cart with the order on it', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		test.slow();
		const { page } = ctx;
		const started = await startGuestSale(ctx);
		await addProduct(ctx, started);
		await changeQuantity(ctx, started);
		// Step 4 saves the order and hands it to trackOrder, so teardown trashes it.
		const sale = await checkOut(ctx, started);
		expect(sale.orderId, 'the saved order is tracked for cleanup').toBeGreaterThan(0);

		await checkoutControl(page, sale.surface, 'close').click();

		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('cart-quantity-input')).toHaveCount(1);
		await expect(page.getByTestId('cart-quantity-input')).toHaveText('3');
	});

	test("add from the table view's add button", async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		const { page } = ctx;
		const started = await startGuestSale(ctx);
		await ensureTableView(page);
		try {
			await addProduct(ctx, started);
			await expect(page.getByTestId('cart-quantity-input')).toHaveCount(1);
		} finally {
			// Later tests in this worker start from the grid.
			await ensureGridView(page);
		}
	});

	// #2370: a burst of adds shows ONE added-to-cart toast that updates in place, and no toast takes
	// a tap meant for the product grid (on the iPad a stack of them covered the top product row).
	test('a five-add burst shows one toast and every tap lands', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		const { page } = ctx;
		const started = await startGuestSale(ctx);

		// With writer credentials step 2 adds the run-private probe, and the burst taps its control.
		// Without them the burst taps the shared-SKU tile from its first add. One product either way,
		// or the line count below fails.
		let control = checkoutProbeAddControl(page);
		let firstTap = 0;
		if (control !== null) {
			await addProduct(ctx, started);
			firstTap = 1;
		} else {
			// Step 2 is skipped: its desktop fallback can add a product other than sharedProductTile's.
			control = await sharedProductTile(page);
		}
		await expect(control).toBeVisible({ timeout: 30_000 });
		for (let adds = firstTap; adds < BURST_ADDS; adds += 1) {
			const hit = await hitTarget(control);
			expect(
				hit,
				`add ${adds + 1} of ${BURST_ADDS} lands on the product, not on ${hit.coveredBy}`
			).toEqual(expect.objectContaining({ landsOnControl: true }));
			await control.click();
			await page.waitForTimeout(200);
		}

		await expect(page.getByTestId('cart-quantity-input').first()).toHaveText(String(BURST_ADDS), {
			timeout: 15_000,
		});
		const name = `toast-burst-after-${BURST_ADDS}-adds`;
		const path = testInfo.outputPath(`${name}.png`);
		await page.screenshot({ path });
		await testInfo.attach(name, { path, contentType: 'image/png' });
		// Sampled once, not polled: a stack of toasts expiring one by one would pass through 1.
		expect(await page.getByTestId('success-toast').count(), 'added-to-cart toasts open').toBe(1);
		// One product, one cart line: no tap went to another product.
		await expect(page.getByTestId('cart-quantity-input')).toHaveCount(1);
	});

	// Both G7 gates are quarantined (e2e/quarantine.json): this test reads and attaches the timings
	// and never asserts them. It fails only when the journey or the harness check below fails.
	test('cart add timing (quarantined G7 gates: read, never asserted)', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		const { page } = ctx;
		const started = await startGuestSale(ctx);
		// The reading is for the add, not the sync: measure after the startup writes drain.
		await waitForCadenceStart(page);
		await beginCartAddMeasurement(page);
		await addProduct(ctx, started);
		await readCartAddMeasurement(page, testInfo, CART_ADD_BUDGET_MS);

		// Twenty adds need one product identity for every tap: the run-private probe's own control.
		// Without writer credentials only the single-add reading is attached.
		const control = checkoutProbeAddControl(page);
		if (control !== null) {
			const quantity = page.getByTestId('cart-quantity-input').first();
			const burstStartedAt = await page.evaluate(() => performance.now());
			for (let index = 0; index < 19; index += 1) {
				await control.click();
				if (index < 18) await page.waitForTimeout(200);
			}
			const settled = await expect
				.poll(async () => (await quantity.textContent())?.trim(), { timeout: 20_000 })
				.toBe('20')
				.then(
					() => true,
					() => false
				);
			const settledMs = settled
				? await page.evaluate((start) => performance.now() - start, burstStartedAt)
				: null;
			const finalQuantity = await quantity.textContent().then(
				(text) => text?.trim() ?? null,
				() => null
			);
			await testInfo.attach('cart-add-burst', {
				body: JSON.stringify({
					metric: 'first-burst-click-to-quantity-20-in-dom',
					platform: 'web',
					project: testInfo.project.name,
					adds: 20,
					paceMs: 200,
					// A label from the quarantined gate, never compared.
					budgetMs: 8_000,
					settledMs,
					finalQuantity,
					asserted: false,
				}),
				contentType: 'application/json',
			});
		}

		expect(
			testInfo.attachments.map((attachment) => attachment.name),
			'the single-add timing reading is attached'
		).toContain('cart-add-performance');
	});

	test('a save ack with no payment link blocks payment', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		test.slow();
		const { page } = ctx;
		await omitPaymentLinkFromPushAcks(page);
		const started = await startGuestSale(ctx);
		await addProduct(ctx, started);

		// Listening before checkout opens, so the gateway fetch on mount is not missed.
		const gatewaysLoaded = gatewaysResponse(page);
		// Step 4 saves the order and hands it to trackOrder, so teardown trashes it.
		const { surface } = await checkOut(ctx, started);
		await expectPaymentBlocked(page, surface, gatewaysLoaded, 15_000);
	});

	test('a built-in POS gateway stays on the legacy webview even with supports_checkout=true', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		test.slow();
		const { page } = ctx;
		// Only the legacy checkout draws the webview by the session's mode; the tender flow ignores
		// it. A 404 says the store serves no payments contract, so the app drops its descriptor.
		const isPaymentMethodsUrl = (url: URL) =>
			isWcposRestRoute(url.href, '/wcpos/v2/payment-methods');
		let methodsRefused = (): void => {};
		const refused = new Promise<void>((resolve) => (methodsRefused = resolve));
		await page.route(isPaymentMethodsUrl, async (route) => {
			const body = '{"code":"rest_no_route","data":{"status":404}}';
			await route.fulfill({ status: 404, contentType: 'application/json', body });
			methodsRefused();
		});
		await page.route(isPaymentGatewaysUrl, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([
					{
						id: 'pos_cash',
						provider: 'wcpos',
						pos_type: 'manual',
						capabilities: { supports_checkout: true },
					},
				]),
			});
		});

		// posPage booted the app, which reads payment methods at start: reload so it meets the stub.
		await page.reload();
		await refused;
		const started = await startGuestSale(ctx);
		await addProduct(ctx, started);
		await checkOut(ctx, started);
		// Contract mode draws a text body in its place, and posts only when Process is pressed.
		await expect(
			page.getByTestId('checkout-dialog').getByTestId('checkout-payment-webview')
		).toBeVisible({ timeout: 30_000 });
	});

	test('a standard, reduced and non-taxable cart saves with per-line tax parity', async ({
		posPage,
		request,
		storeAuthorization,
		trackOrder,
	}, testInfo) => {
		const ctx = journeyContext({ posPage, request, storeAuthorization, trackOrder }, testInfo);
		test.slow();
		const { page } = ctx;
		const label = newRunLabel();
		const divergence = captureDivergenceLog(page);
		// Step 1 only: all three lines come from the owned tax-class fixtures, never step 2's add.
		await startGuestSale(ctx);
		const added = {
			standard: await tryAddProductBySku(page, TAX_CLASS_SKU.standard),
			reduced: await tryAddProductBySku(page, TAX_CLASS_SKU.reduced),
			nonTaxable: await tryAddProductBySku(page, TAX_CLASS_SKU.nonTaxable),
		};
		const missing = Object.entries(added).filter(([, outcome]) => outcome !== 'added');
		if (missing.length > 0) {
			test.skip(
				true,
				`tax-class fixtures unavailable on this store (` +
					missing
						.map(
							([role, outcome]) =>
								`${TAX_CLASS_SKU[role as keyof typeof TAX_CLASS_SKU]}: ${outcome}`
						)
						.join(', ') +
					`). Run e2e/scripts/tax-class-fixtures.php against it — see that file's header.`
			);
			return;
		}
		await stampRunLabel(page, label);

		const sale = await saveAndCapture(page, trackOrder, label, testInfo);
		assertMixedTaxTreatment(sale.doc, 'mixed-class cart');
		assertSaleParity(sale, page, 'line_items', 'mixed-class cart');
		await expectNoBanner(page, 'mixed-class cart', divergence);
	});
});
