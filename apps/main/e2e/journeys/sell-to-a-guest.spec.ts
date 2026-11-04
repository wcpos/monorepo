/**
 * roadmap#514: J2 "Sell to a guest", walking `sell-to-a-guest.ts`, then J2's edge cases.
 * - phone New sale and drawer round trip supersedes `checkout-tender.spec.ts:703`
 * - keypad Done then Enter supersedes `pos-cart.spec.ts:113`
 * - keypad digits supersedes `pos-cart.spec.ts:135`
 * - closing checkout supersedes `pos-checkout.spec.ts:272`
 * - table-view add supersedes `products.spec.ts:119`
 */
import { expect, type Page, type TestInfo } from '@playwright/test';

import { digitsOf, ledgerRows, pollOrder } from '../checkout-shared';
import { getStoreUrl, getStoreVariant } from '../fixtures';
import {
	checkoutControl,
	type CheckoutSurface,
	expectOrderPaid,
	readOrder,
	type ServerOrder,
	liveOrderTest as test,
} from '../order-lifecycle';
import { ensureGridView, ensureTableView } from '../pos-view-mode';
import { resolveProbeAuthorization } from '../probe-credential';
import {
	addProduct,
	changeQuantity,
	checkOut,
	sellToAGuest,
	type SellToAGuestContext,
	startGuestSale,
} from './sell-to-a-guest';

/** The four `liveOrderTest` fixtures a J2 test destructures, and the journey context from them. */
type Fixtures = Omit<SellToAGuestContext, 'page' | 'testInfo' | 'onStep'> & { posPage: Page };
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
		// As numbers, then digits: trailing zeros differ between the cart's string and dp=6.
		expect(digitsOf(String(Number(server.total))), 'server total must equal the cart total').toBe(
			digitsOf(String(Number(sale.cartTotal)))
		);
		const lines = server.line_items ?? [];
		expect(lines, 'the sale has one line').toHaveLength(1);
		expect(Number(lines[0].quantity), 'the line carries the keyed quantity').toBe(sale.quantity);
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
		// A keyboard-wedge scanner's Enter used to press the refocused quantity trigger and reopen
		// the numpad for the wrong row. The burst is shorter than the store's minimum code length on
		// purpose: it never reaches the catalog, and the assertion is only that the terminator did
		// not act on the button.
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

		const surface: CheckoutSurface = (await page.getByTestId('checkout-tender-pane').isVisible())
			? 'pane'
			: 'modal';
		await checkoutControl(page, surface, 'close').click();

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
});
