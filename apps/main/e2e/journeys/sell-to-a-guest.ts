/**
 * J2 "Sell to a guest": a cashier's guest cash sale, written once as seven steps.
 *
 * - Start state: register open, empty cart, Guest customer, Products visible.
 * - Edition: Free. Tender cash on Pro stores that serve the payments contract, the legacy
 *   webview pay otherwise.
 * - Docs: `pos/checkout/index.mdx` (wcpos/docs, `versioned_docs/version-2.x`).
 * - Soak-loopable: yes, the reset is step 7, which leaves the start state holding again.
 * - Source ruling: wcpos/roadmap#513 and #514.
 *
 * It never reads the order back: server truth is the caller's job, so a soak loop can skip it.
 */
import {
	type APIRequestContext,
	expect,
	type Locator,
	type Page,
	test,
	type TestInfo,
} from '@playwright/test';

import {
	addCheckoutProbeProduct,
	addCheckoutProbeProductAgain,
	checkoutProbeAddControl,
} from '../checkout-probe';
import {
	clickAndExpectPaymentWrite,
	type Descriptor,
	digitsOf,
	openCheckout,
	readAmountMinor,
	requireTenderCheckout,
} from '../checkout-shared';
import { E2E_PRODUCT_SKU, type StoreAuthorization } from '../fixtures';
import {
	checkoutControl,
	type CheckoutSurface,
	checkoutSurfaceLocator,
	newRunLabel,
	processPayment,
	readCartMoney,
	stampRunLabel,
	type TrackedOrder,
} from '../order-lifecycle';
import { openRegister, posLayout, showPhoneTab } from './open-register';

export const SELL_TO_A_GUEST = {
	key: 'J2',
	title: 'Sell to a guest',
	edition: 'free',
	docsPage: 'pos/checkout/index.mdx',
	soakLoopable: true,
	resetStep: 7,
} as const;

export const STEPS = [
	{ number: 1, slug: 'start-guest-sale', title: 'Start a sale for a guest' },
	{ number: 2, slug: 'add-product', title: 'Add a product' },
	{ number: 3, slug: 'change-quantity', title: 'Change the quantity' },
	{ number: 4, slug: 'check-out', title: 'Check out' },
	{ number: 5, slug: 'take-cash', title: 'Take cash' },
	{ number: 6, slug: 'see-paid', title: 'See it paid' },
	{ number: 7, slug: 'new-sale', title: 'Start the next sale' },
] as const;
export type JourneyStep = (typeof STEPS)[number];

export interface SellToAGuestContext {
	page: Page;
	request: APIRequestContext;
	testInfo: TestInfo;
	storeAuthorization: () => StoreAuthorization | null;
	trackOrder: (order: TrackedOrder) => void;
	/** Runs after a step's own assertions pass; the captures caller shoots here. */
	onStep?: (step: JourneyStep) => Promise<void>;
}

/** What steps 1 to 3 leave: the layout, detected once in step 1. */
export interface SaleInProgress {
	layout: 'phone' | 'columns';
}

/** What step 4 leaves: the saved order at checkout, and what the cashier is asked to pay. */
export interface SaleAtCheckout extends SaleInProgress {
	orderId: number;
	uuid: string;
	mode: 'tender' | 'legacy';
	cartTotal: string;
	balanceMinor: number;
	cashMethodId: string | null;
}

export interface GuestSale extends SaleAtCheckout {
	/** The quantity step 3 keyed in. */
	quantity: number;
}

/** The quantity step 3 keys in. */
const QUANTITY = 3;
/** Pages whose columns walk already added the probe once. */
const probeAddedOn = new WeakSet<Page>();

/** Methods the tender grid can drive: enabled, and captured by the app itself. */
function manualMethods(descriptors: Descriptor[]): Descriptor[] {
	return descriptors.filter((method) => method.pos_enabled && method.capture?.mode === 'manual');
}

async function journeyStep<T>(
	ctx: SellToAGuestContext,
	number: JourneyStep['number'],
	body: () => Promise<T>
): Promise<T> {
	const step = STEPS[number - 1];
	return test.step(`${step.number}. ${step.title}`, async () => {
		const result = await body();
		await ctx.onStep?.(step);
		return result;
	});
}

/** The products grid's search, in whichever layout is on screen. */
function productsSearch(page: Page, layout: SaleInProgress['layout']) {
	return layout === 'phone'
		? page.getByTestId('search-products').filter({ visible: true })
		: page.getByTestId('pos-products-panel').getByTestId('search-products');
}

/** The start state: an open register, an empty cart for the Guest, and the Products view. */
async function expectStartState(page: Page, layout: SaleInProgress['layout']): Promise<void> {
	if (layout === 'phone') await showPhoneTab(page, 'cart');
	await expect(page.getByTestId('cart-customer-name')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('cart-quantity-input')).toHaveCount(0, { timeout: 30_000 });
	if (layout === 'phone') await showPhoneTab(page, 'products');
	await expect(productsSearch(page, layout)).toBeVisible({ timeout: 30_000 });
}

/** 1. Start a sale for a guest. */
export async function startGuestSale(ctx: SellToAGuestContext): Promise<SaleInProgress> {
	return journeyStep(ctx, 1, async () => {
		const { page } = ctx;
		await openRegister(page);
		const layout = await posLayout(page);
		await expectStartState(page, layout);
		return { layout };
	});
}

/**
 * The shared-SKU product's tile, left filtered on screen, or the first visible tile when the SKU
 * filter does not narrow the grid to one: the product step 2's phone add taps. On desktop, the
 * shared-SKU fallback in `addCheckoutProbeProduct` may add the first catalogue tile instead.
 */
export async function sharedProductTile(page: Page): Promise<Locator> {
	const posScreen = page.getByTestId('screen-pos').filter({ visible: true });
	const search = posScreen.getByTestId('search-products').filter({ visible: true });
	const tiles = posScreen.getByTestId('product-tile').filter({ visible: true });
	const variableTiles = posScreen.getByTestId('variable-product-tile').filter({ visible: true });
	await search.fill(E2E_PRODUCT_SKU);
	// Variable tiles count too: an unfiltered grid can show a single simple tile among them.
	const matched = await expect
		.poll(async () => (await tiles.count()) + (await variableTiles.count()), { timeout: 15_000 })
		.toBe(1)
		.then(
			() => true,
			() => false
		);
	if (!matched) await search.clear();
	return tiles.first();
}

/** 2. Add a product: the run-private probe, or the shared-SKU fallback without writer secrets. */
export async function addProduct(ctx: SellToAGuestContext, sale: SaleInProgress): Promise<void> {
	await journeyStep(ctx, 2, async () => {
		const { page } = ctx;
		if (sale.layout === 'phone') {
			// The probe add needs cart and grid on screen at once; a phone shows one tab: tap the tile.
			await showPhoneTab(page, 'products');
			await (await sharedProductTile(page)).click();
			await productsSearch(page, 'phone').clear();
			await showPhoneTab(page, 'cart');
		} else {
			const again = probeAddedOn.has(page);
			if (again && checkoutProbeAddControl(page) === null) {
				// Without a probe, the grid's first simple tile may manage stock; a looped walk would
				// drain it until the stock guard refuses the quantity. Sell the shared SKU again instead.
				await (await sharedProductTile(page)).click();
				await productsSearch(page, sale.layout).clear();
			} else {
				// A repeat search of a satisfied demand fires no wire request: later walks re-add locally.
				await (again ? addCheckoutProbeProductAgain : addCheckoutProbeProduct)(page);
			}
			probeAddedOn.add(page);
		}
		await expect(page.getByTestId('cart-quantity-input')).toHaveCount(1, { timeout: 15_000 });
		await expect(page.getByTestId('cart-quantity-input')).toHaveText('1');
	});
}

/** 3. Change the quantity on the line with its keypad. */
export async function changeQuantity(
	ctx: SellToAGuestContext,
	sale: SaleInProgress
): Promise<void> {
	await journeyStep(ctx, 3, async () => {
		const { page } = ctx;
		if (sale.layout === 'phone') await showPhoneTab(page, 'cart');
		const quantity = page.getByTestId('cart-quantity-input');
		await quantity.click();
		// The keypad's own keys, by testID: popover at columns width, bottom sheet on a phone.
		const done = page.getByTestId('keypad-key-done');
		await expect(done).toBeVisible({ timeout: 15_000 });
		await page.getByTestId(`keypad-key-${QUANTITY}`).click();
		await done.click();
		await expect(done, 'Done closes the quantity keypad').toBeHidden({ timeout: 15_000 });
		await expect(quantity).toHaveText(String(QUANTITY), { timeout: 15_000 });
		await expect(page.getByTestId('cart-subtotal')).toHaveText(/\d/, { timeout: 15_000 });
		await expect(page.getByTestId('cart-order-total')).toHaveText(/\d/, { timeout: 15_000 });
	});
}

/** 4. Check out: label and save the order, then read what checkout asks the cashier for. */
export async function checkOut(
	ctx: SellToAGuestContext,
	sale: SaleInProgress
): Promise<SaleAtCheckout> {
	return journeyStep(ctx, 4, async () => {
		const { page, request, testInfo, storeAuthorization, trackOrder } = ctx;
		if (sale.layout === 'phone') await showPhoneTab(page, 'cart');
		const label = newRunLabel();
		await stampRunLabel(page, label);
		// BEFORE the save: the POS adopts the server's money once the ack lands.
		const { total: cartTotal } = await readCartMoney(page);
		const { orderId, uuid, mode } = await openCheckout(page, (order) =>
			trackOrder({ ...order, label })
		);

		if (mode === 'tender') {
			const { descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const balanceMinor = await readAmountMinor(page, 'checkout-balance');
			// The order total lives in the ledger column, which the phone's compact dialog omits.
			if (sale.layout === 'columns') {
				const totalMinor = await readAmountMinor(page, 'checkout-order-total');
				expect(balanceMinor, 'a fresh order owes its whole total').toBe(totalMinor);
			}
			expect(balanceMinor, 'checkout must show a non-zero balance').toBeGreaterThan(0);
			const cash = manualMethods(descriptors).find((method) => method.kind === 'cash');
			test.skip(!cash, 'store declares no manual cash method');
			return { ...sale, orderId, uuid, mode, cartTotal, balanceMinor, cashMethodId: cash!.id };
		}

		// Legacy: the modal must show the same amount the cart's Pay button shows, as digits.
		const surface: CheckoutSurface = (await page.getByTestId('checkout-tender-pane').isVisible())
			? 'pane'
			: 'modal';
		const amount = checkoutControl(page, surface, 'amount');
		await expect(amount).toBeVisible({ timeout: 15_000 });
		const shown = digitsOf((await amount.textContent()) ?? '');
		const cartTotalId = surface === 'pane' ? 'checkout-order-total' : 'checkout-button';
		const cartShown = digitsOf((await page.getByTestId(cartTotalId).textContent()) ?? '');
		expect(Number(shown), 'checkout must show a non-zero amount').toBeGreaterThan(0);
		expect(shown, 'checkout must show the same total as the cart').toBe(cartShown);
		await expect(checkoutControl(page, surface, 'close')).toBeVisible();
		return {
			...sale,
			orderId,
			uuid,
			mode,
			cartTotal,
			balanceMinor: Number(shown),
			cashMethodId: null,
		};
	});
}

/** 5. Take cash: the cash tile opens prefilled with the balance; the cashier confirms it. */
export async function takeCash(ctx: SellToAGuestContext, sale: SaleAtCheckout): Promise<void> {
	await journeyStep(ctx, 5, async () => {
		const { page } = ctx;
		if (sale.mode === 'legacy') {
			await processPayment(page);
			return;
		}
		await page.getByTestId(`checkout-method-${sale.cashMethodId}`).click();
		await expect
			.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
			.toBe(sale.balanceMinor);
		await clickAndExpectPaymentWrite(page, 'checkout-commit', sale.orderId, 'record');
	});
}

/** 6. See it paid. */
export async function seePaid(ctx: SellToAGuestContext, sale: SaleAtCheckout): Promise<void> {
	await journeyStep(ctx, 6, async () => {
		const { page } = ctx;
		if (sale.mode === 'legacy') {
			// What the legacy pay asserts on the UI once it settles: checkout has left the screen.
			await expect(checkoutSurfaceLocator(page)).toBeHidden({ timeout: 30_000 });
			return;
		}
		await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 120_000 });
		await expect(page.getByTestId('receipt-paid-banner')).toBeVisible();
	});
}

/** 7. Start the next sale: the reset that puts step 1's start state back. */
export async function startNextSale(ctx: SellToAGuestContext, sale: SaleAtCheckout): Promise<void> {
	await journeyStep(ctx, 7, async () => {
		const { page } = ctx;
		if (sale.mode === 'tender') {
			await page.getByTestId('receipt-new-sale').click();
			await expect(page.getByTestId('checkout-tender-pane')).toBeHidden({ timeout: 30_000 });
			await expect(page.getByTestId('checkout-receipt-stage')).toBeHidden({ timeout: 30_000 });
		} else {
			// A legacy pay opens the receipt modal when the store's auto-show setting is on (the
			// shipped default); the next sale starts once the cashier closes it.
			const receipt = page.getByTestId('receipt-dialog');
			const shown = await receipt
				.waitFor({ state: 'visible', timeout: 15_000 })
				.then(() => true)
				.catch(() => false);
			if (shown) {
				await page.getByTestId('receipt-close-button').click();
				await expect(receipt).toBeHidden({ timeout: 15_000 });
			}
		}
		// New sale lands on the Products view before anything else is touched.
		await expect(productsSearch(page, sale.layout)).toBeVisible({ timeout: 30_000 });
		await expectStartState(page, sale.layout);
	});
}

/** The whole walk, steps 1 to 7, ending in the state it started in. */
export async function sellToAGuest(ctx: SellToAGuestContext): Promise<GuestSale> {
	const started = await startGuestSale(ctx);
	await addProduct(ctx, started);
	await changeQuantity(ctx, started);
	const sale = await checkOut(ctx, started);
	await takeCash(ctx, sale);
	await seePaid(ctx, sale);
	await startNextSale(ctx, sale);
	return { ...sale, quantity: QUANTITY };
}
