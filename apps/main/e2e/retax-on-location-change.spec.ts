/**
 * #1875: a cart write that moves the order's tax location to another rate set re-taxes its
 * lines (tax fields only), and the till's total still equals the server's at 6 dp.
 *
 * Store-agnostic: L1 is the guest's address (the store's base country, no state), L2 is a
 * location the store's own standard-class rates tax differently. Customers come through the
 * store API and are deleted in teardown; orders are rung up through the POS UI.
 */
import { type APIRequestContext, expect, type Page, type TestInfo } from '@playwright/test';

import { addCheckoutProbeProduct } from './checkout-probe';
import {
	clickAndExpectPaymentWrite,
	type Descriptor,
	ledgerRows,
	pollOrder,
	readAmountMinor,
	requireTenderCheckout,
} from './checkout-shared';
import { becomesVisible, closeOrderSheet, getStoreUrl } from './fixtures';
import { fillKeypadField } from './keypad-field';
import { assertDiscriminating, linesOf } from './money-oracle-guards';
import { captureDivergenceLog, saveAndCapture } from './money-oracle-sale';
import {
	cartRecordUuid,
	checkoutControl,
	checkoutSurface,
	createPushOrdersResponseMatcher,
	expectMoneyMatches,
	expectOrderPaid,
	expectTaxParity,
	liveOrderTest as liveTest,
	newRunLabel,
	type OrderPayload,
	readCartMoney,
	readOrder,
	type ServerOrder,
	stampRunLabel,
	type TrackedOrder,
} from './order-lifecycle';
import {
	resolveProbeAuthorization,
	type StoreAuthorization,
	storeRequestOptions,
} from './probe-credential';
import {
	createSearchProbe,
	deleteSearchProbe,
	searchAndWaitForServer,
	type SearchProbe,
} from './search-probe';

interface Rate {
	id: number;
	country?: string;
	state?: string;
	postcode?: string;
	city?: string;
	postcodes?: string[];
	cities?: string[];
	rate: string;
	priority?: number;
	class?: string;
}
interface Place {
	country: string;
	state: string;
}
type Line = { total?: string; total_tax?: string; subtotal?: string };
interface Setup {
	authorization: StoreAuthorization;
	basis: string;
	dp: number;
	inclusive: boolean;
	l1: Place;
	l2: Place;
	/** Cashier-entered amounts whose every per-rate tax at L1 and at L2 is not a whole cent. */
	misc: string;
	edited: string;
	fee: string;
}

const AMOUNTS = ['9.99', '7.77', '3.33', '11.11', '13.37', '2.47', '12.34', '6.66', '1.11', '1'];

async function getJson<T>(request: APIRequestContext, url: string, auth: StoreAuthorization) {
	const { headers, params } = storeRequestOptions(auth);
	const response = await request.get(url, {
		headers: { 'X-WCPOS': '1', ...headers },
		params: { ...params, per_page: '100' },
		failOnStatusCode: false,
	});
	expect(response.ok(), `GET ${new URL(url).pathname} returned ${response.status()}`).toBe(true);
	return (await response.json()) as T;
}

/** WooCommerce's match: one rate per priority, the most specific first. City and postcode
 * scoped rates are left out, so the chosen locations never depend on them. */
function rateSet(rates: Rate[], at: Place): Rate[] {
	const same = (a: string | undefined, b: string) => !a || a.toUpperCase() === b.toUpperCase();
	const specific = (r: Rate) => (r.country ? 2 : 0) + (r.state ? 1 : 0);
	const matches = rates
		.filter((r) => same(r.country, at.country) && same(r.state, at.state))
		.sort((a, b) => specific(b) - specific(a));
	const byPriority = new Map<number, Rate>();
	for (const r of matches) if (!byPriority.has(r.priority ?? 1)) byPriority.set(r.priority ?? 1, r);
	return [...byPriority.values()];
}

const percent = (set: Rate[]) => set.reduce((sum, r) => sum + Number(r.rate), 0);

function discriminates(amount: string, sets: Rate[][], inclusive: boolean, dp: number) {
	return sets.every((set) =>
		set.every((r) => {
			const base = inclusive ? 100 + percent(set) : 100;
			const tax = (Number(amount) * Number(r.rate)) / base;
			return Number(tax.toFixed(dp)) !== Number(tax.toFixed(6));
		})
	);
}

async function setup(
	request: APIRequestContext,
	testInfo: TestInfo,
	storeAuthorization: () => StoreAuthorization | null
): Promise<Setup> {
	const storeUrl = getStoreUrl(testInfo).replace(/\/+$/, '');
	const authorization = await resolveProbeAuthorization(request, storeUrl, storeAuthorization);
	type Store = Record<string, string | boolean | number | undefined>;
	const stores = await getJson<Store[]>(
		request,
		`${storeUrl}/wp-json/wcpos/v1/stores`,
		authorization
	);
	const key = (s: Store) =>
		[s.tax_based_on, s.store_country, s.store_state, s.prices_include_tax].join('|');
	liveTest.skip(stores.length === 0, 'the store API returned no POS store');
	liveTest.skip(
		new Set(stores.map(key)).size > 1,
		"the POS stores differ in tax basis or base location, so the till's L1 is not known up front"
	);
	const store = stores[0];
	const basis = String(store.tax_based_on ?? 'base');
	liveTest.skip(
		basis === 'base',
		'tax is based on the store base: a customer cannot move the rates (#3850)'
	);
	// The guest's billing address (use-guest-customer.ts): the store country, no state.
	const guest = { country: String(store.store_country ?? ''), state: '' };
	const all = await getJson<Rate[]>(request, `${storeUrl}/wp-json/wcpos/v2/taxes`, authorization);
	const rates = all.filter(
		(r) =>
			(r.class || 'standard') === 'standard' &&
			!r.postcode &&
			!r.city &&
			!r.postcodes?.length &&
			!r.cities?.length
	);
	const l1 = rateSet(rates, guest);
	// A country-wide rate first: E2 moves the customer through the country picker alone.
	const l2 = rates
		.filter((r) => r.country)
		.map((r) => ({ country: r.country!, state: r.state ?? '' }))
		.sort((a, b) => Number(Boolean(a.state)) - Number(Boolean(b.state)))
		.find((at) => {
			const set = rateSet(rates, at);
			return set.length > 0 && percent(set) !== percent(l1);
		});
	liveTest.skip(
		l1.length === 0 || !l2,
		`no pair of locations with different, non-empty standard rate sets (the guest at ${guest.country} has ${l1.length} rates)`
	);
	const sets = [l1, rateSet(rates, l2!)];
	const dp = Number(store.price_num_decimals ?? 2);
	const pick = (inclusive: boolean, skip: string[] = []) =>
		AMOUNTS.find((a) => !skip.includes(a) && discriminates(a, sets, inclusive, dp));
	const inclusive = store.prices_include_tax === true || store.prices_include_tax === 'yes';
	const misc = pick(inclusive);
	const edited = pick(inclusive, misc ? [misc] : []);
	// A cart fee's price includes tax by default (pos-money-oracle.spec.ts).
	const fee = pick(true);
	liveTest.skip(!misc || !edited || !fee, 'no amount has a sub-cent tax at both L1 and L2');
	return {
		authorization,
		basis,
		dp,
		inclusive,
		l1: guest,
		l2: l2!,
		misc: misc!,
		edited: edited!,
		fee: fee!,
	};
}

async function createCustomer(
	request: APIRequestContext,
	testInfo: TestInfo,
	authorization: StoreAuthorization,
	at: Place,
	created: SearchProbe[]
): Promise<SearchProbe> {
	const address = { country: at.country, state: at.state };
	const result = await createSearchProbe({
		request,
		storeUrl: getStoreUrl(testInfo),
		authorization,
		collection: 'customers',
		workerIndex: testInfo.workerIndex,
		customerData: { billing: address, shipping: address },
	});
	if (!result.ok) liveTest.skip(true, result.reason);
	if (!result.ok) throw new Error(result.reason);
	created.push(result.probe);
	return result.probe;
}

async function openCartMenuAndClick(page: Page, menuItemTestId: string) {
	await page.getByTestId('add-cart-item-menu').click();
	await expect(page.getByTestId(menuItemTestId)).toBeVisible({ timeout: 5_000 });
	await page.getByTestId(menuItemTestId).click();
}

async function fillCurrencyField(page: Page, testID: string, value: string) {
	await fillKeypadField(page, testID, value);
	await expect(page.getByTestId(testID), `${testID} committed nothing`).toHaveText(/[1-9]/, {
		timeout: 10_000,
	});
}

/** The cart E1 and E2 ring up: a catalogue line at an edited price, a misc line and a fee. */
async function ringUp(page: Page, s: Setup, label: string) {
	await addCheckoutProbeProduct(page);
	// Before the misc line, which has a price field of its own.
	await fillCurrencyField(page, 'cart-price', s.edited);
	await openCartMenuAndClick(page, 'menu-add-misc-product');
	const misc = page.getByTestId('add-misc-product-dialog');
	await expect(misc).toBeVisible({ timeout: 15_000 });
	await expect
		.poll(
			() =>
				page.evaluate(
					() => document.activeElement?.closest('[data-testid="add-misc-product-dialog"]') != null
				),
			{ timeout: 15_000 }
		)
		.toBe(true);
	await fillCurrencyField(page, 'misc-product-price-input', s.misc);
	await page.getByTestId('add-to-cart-submit').click();
	await expect(misc).toBeHidden({ timeout: 15_000 });
	await openCartMenuAndClick(page, 'menu-add-fee');
	const fee = page.getByTestId('add-fee-dialog');
	await expect(fee).toBeVisible({ timeout: 15_000 });
	await fillCurrencyField(page, 'fee-amount-input', s.fee);
	await page.getByTestId('add-to-cart-submit').click();
	await expect(fee).toBeHidden({ timeout: 15_000 });
	await stampRunLabel(page, label);
}

async function pickCustomer(page: Page, customer: SearchProbe) {
	await page.getByTestId('cart-customer-name').click();
	const search = page.getByTestId('combobox-search').filter({ visible: true });
	if (!(await becomesVisible(search, 10_000)))
		await page.getByTestId('cart-customer-select').click();
	await searchAndWaitForServer(page, search, 'customers', customer.token);
	await page.getByTestId(`customer-select-option-${customer.id}`).click();
	await expect(page.getByTestId('cart-customer-name')).toContainText(customer.token, {
		timeout: 15_000,
	});
}

interface Till {
	sent: OrderPayload;
	total: string;
	orderId: number;
}

/** Click checkout and capture the till's own lines (the push) and total (read before it). */
async function checkout(page: Page, trackOrder: (o: TrackedOrder) => void, label: string) {
	const { total } = await readCartMoney(page);
	const recordId = await cartRecordUuid(page);
	const pushed = page.waitForResponse(createPushOrdersResponseMatcher(recordId), {
		timeout: 90_000,
	});
	pushed.catch(() => {});
	await page.getByTestId('checkout-button').click();
	const response = await pushed;
	expect(response.status(), `${label}: the checkout push must succeed`).toBeLessThan(400);
	const envelope = (response.request().postDataJSON() ?? {}) as { payload?: OrderPayload };
	const ack = (await response.json().catch(() => null)) as { document?: ServerOrder } | null;
	const orderId = Number(ack?.document?.id ?? 0);
	expect(orderId, `${label}: the push ack must name the order`).toBeGreaterThan(0);
	trackOrder({ id: orderId, uuid: recordId, label });
	const tender = page.getByTestId('checkout-tender-pane');
	const legacy = page.getByTestId('checkout-dialog');
	await expect(tender.or(legacy).filter({ visible: true }).first()).toBeVisible({
		timeout: 60_000,
	});
	const mode: 'tender' | 'legacy' = (await tender.isVisible()) ? 'tender' : 'legacy';
	return { till: { sent: envelope.payload ?? {}, total, orderId } as Till, mode };
}

function cashOf(descriptors: Descriptor[]): Descriptor {
	const cash = descriptors.find(
		(m) => m.pos_enabled && m.capture?.mode === 'manual' && m.kind === 'cash'
	);
	liveTest.skip(!cash, 'store declares no manual cash method');
	return cash!;
}

/** Take the whole balance in cash and finish on the receipt. */
async function payRest(page: Page, cash: Descriptor, orderId: number, divergence: () => string[]) {
	const balance = await readAmountMinor(page, 'checkout-balance');
	await page.getByTestId(`checkout-method-${cash.id}`).click();
	await expect
		.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
		.toBe(balance);
	await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');
	await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 120_000 });
	await expect(page.getByTestId('receipt-paid-banner')).toBeVisible();
	await expect(page.getByTestId('order-totals-changed-banner')).not.toBeVisible();
	expect(divergence(), 'the app logged a money divergence').toEqual([]);
	await page.getByTestId('receipt-new-sale').click();
}

const keys = ['line_items', 'fee_lines'] as const;
const lines = (order: OrderPayload | ServerOrder, key: string) =>
	linesOf(order as Record<string, unknown>, key) as Line[];
const taxOf = (order: OrderPayload) =>
	[...keys, 'shipping_lines']
		.flatMap((key) => lines(order, key))
		.reduce((sum, line) => sum + Number(line.total_tax ?? 0), 0)
		.toFixed(6);

/** Every line's tax moved, every line's total held, the edited line kept its price. */
function expectRetaxed(before: OrderPayload, after: OrderPayload, s: Setup) {
	for (const key of keys) {
		const was = lines(before, key);
		expect(lines(after, key).length, `${key} count`).toBe(was.length);
		lines(after, key).forEach((line, i) => {
			expect(Number(line.total_tax), `${key}[${i}] total_tax must move`).not.toBe(
				Number(was[i].total_tax)
			);
			expectMoneyMatches(line.total, was[i].total, `${key}[${i}] total is kept`);
		});
	}
	const [was, edited] = [lines(before, 'line_items')[0], lines(after, 'line_items')[0]];
	expectMoneyMatches(edited.subtotal, was.subtotal, 'the edited line keeps its price');
	if (!s.inclusive) expectMoneyMatches(edited.subtotal, s.edited, 'the edited price');
}

/** The re-tax lands in the customer write: the till total moves before anything else runs. */
async function awaitRetax(page: Page, total: string) {
	await expect
		.poll(async () => (await readCartMoney(page)).total, {
			timeout: 30_000,
			message: 'the cart total must move once the tax location does',
		})
		.not.toBe(total);
}

/** The server against the till's values from before checkout, at 6 dp. */
function expectServerIsTill(server: ServerOrder, till: Till, label: string) {
	expectMoneyMatches(server.total, till.total, `${label}: total`);
	expectTaxParity(server.total_tax, taxOf(till.sent), `${label}: total_tax`);
	for (const key of keys) {
		const sent = lines(till.sent, key);
		const got = lines(server, key);
		expect(got.length, `${label}: server ${key} count`).toBe(sent.length);
		sent.forEach((line, i) => {
			expectMoneyMatches(got[i].total, line.total, `${label}: ${key}[${i}] total`);
			expectTaxParity(got[i].total_tax, line.total_tax, `${label}: ${key}[${i}] total_tax`);
		});
	}
}

liveTest.describe('#1875 re-tax on a tax-location change — till equals server (live store)', () => {
	const created: SearchProbe[] = [];
	liveTest.afterEach(async ({ request, storeAuthorization }, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const authorization = await resolveProbeAuthorization(request, storeUrl, storeAuthorization);
		if (created.length === 0) return;
		for (const probe of created.splice(0)) {
			await deleteSearchProbe({
				request,
				storeUrl,
				authorization,
				collection: 'customers',
				id: probe.id,
			});
		}
	});

	async function sale(
		{ page, trackOrder, request, storeAuthorization }: Fixtures,
		testInfo: TestInfo,
		move: (s: Setup, label: string) => Promise<void>
	) {
		liveTest.slow();
		const s = await setup(request, testInfo, storeAuthorization);
		const label = newRunLabel();
		const divergence = captureDivergenceLog(page);
		await move(s, label);
		const before = await saveAndCapture(page, trackOrder, label, testInfo);
		assertDiscriminating(before.doc as Record<string, unknown>, 'line_items', label, s.dp);
		assertDiscriminating(before.doc as Record<string, unknown>, 'fee_lines', label, s.dp);
		await closeOrderSheet(page);
		return { s, label, divergence, before: before.sent, total: before.cartTotal };
	}

	type Fixtures = {
		page: Page;
		trackOrder: (o: TrackedOrder) => void;
		request: APIRequestContext;
		storeAuthorization: () => StoreAuthorization | null;
	};

	async function finish(
		f: Fixtures,
		testInfo: TestInfo,
		s: Setup,
		before: OrderPayload,
		label: string,
		divergence: () => string[]
	) {
		const { till, mode } = await checkout(f.page, f.trackOrder, label);
		expectRetaxed(before, till.sent, s);
		const { authorization, descriptors } = await requireTenderCheckout(
			f.request,
			testInfo,
			f.storeAuthorization,
			mode
		);
		await payRest(f.page, cashOf(descriptors), till.orderId, divergence);
		const server = await readOrder(f.request, testInfo, authorization, till.orderId);
		expectOrderPaid(server);
		assertDiscriminating(server as Record<string, unknown>, 'line_items', `${label} at L2`, s.dp);
		assertDiscriminating(server as Record<string, unknown>, 'fee_lines', `${label} at L2`, s.dp);
		expectServerIsTill(server, till, label);
	}

	liveTest(
		'E1: adding a customer at another rate set re-taxes the lines',
		async ({ posPage: page, trackOrder, request, storeAuthorization }, testInfo) => {
			const f = { page, trackOrder, request, storeAuthorization };
			let customer: SearchProbe | undefined;
			const { s, label, divergence, before, total } = await sale(
				f,
				testInfo,
				async (setupOf, run) => {
					customer = await createCustomer(
						request,
						testInfo,
						setupOf.authorization,
						setupOf.l2,
						created
					);
					await ringUp(page, setupOf, run);
				}
			);
			await pickCustomer(page, customer!);
			await awaitRetax(page, total);
			await finish(f, testInfo, s, before, label, divergence);
		}
	);

	liveTest(
		'E2: editing the cart customer’s address to another rate set re-taxes the lines',
		async ({ posPage: page, trackOrder, request, storeAuthorization }, testInfo) => {
			const f = { page, trackOrder, request, storeAuthorization };
			const { s, label, divergence, before, total } = await sale(
				f,
				testInfo,
				async (setupOf, run) => {
					const l1 = await createCustomer(
						request,
						testInfo,
						setupOf.authorization,
						setupOf.l1,
						created
					);
					liveTest.skip(
						Boolean(setupOf.l2.state),
						'L2 needs a state: the state picker is not driven here'
					);
					await ringUp(page, setupOf, run);
					await pickCustomer(page, l1);
				}
			);
			await page.getByTestId('cart-customer-address').click();
			const dialog = page.getByTestId('customer-address-dialog');
			await expect(dialog).toBeVisible({ timeout: 15_000 });
			// Linked, shipping follows billing; unlinked, edit the address the store's basis reads.
			const linked = await dialog.getByTestId('cart-address-shipping-different').isVisible();
			const root = linked || s.basis === 'billing' ? 'billing' : 'shipping';
			await dialog.getByTestId(`cart-address-edit-${root}`).click();
			await dialog.getByTestId('country-select').filter({ visible: true }).click();
			const name =
				new Intl.DisplayNames(['en'], { type: 'region' }).of(s.l2.country) ?? s.l2.country;
			await page.getByTestId('combobox-search').filter({ visible: true }).fill(name);
			await page.getByTestId(`country-select-option-${s.l2.country}`).click();
			await awaitRetax(page, total);
			// The first Escape may only close the country popover.
			for (let i = 0; i < 3 && (await dialog.isVisible()); i++) {
				await page.keyboard.press('Escape');
				await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
			}
			await expect(dialog).toBeHidden({ timeout: 15_000 });
			await finish(f, testInfo, s, before, label, divergence);
		}
	);

	liveTest(
		'E5: a captured partial cash leg, then a customer at another rate set, then the rest',
		async ({ posPage: page, trackOrder, request, storeAuthorization }, testInfo) => {
			liveTest.slow();
			const s = await setup(request, testInfo, storeAuthorization);
			const customer = await createCustomer(request, testInfo, s.authorization, s.l2, created);
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await ringUp(page, s, label);
			const first = await checkout(page, trackOrder, `${label} first leg`);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				first.mode
			);
			const cash = cashOf(descriptors);
			const balance = await readAmountMinor(page, 'checkout-balance');
			const part = Math.floor(balance / 2);
			await page.getByTestId(`checkout-method-${cash.id}`).click();
			await expect(page.getByTestId('checkout-keypad')).toBeVisible({ timeout: 15_000 });
			await page.getByTestId('checkout-keypad-key-clear').click();
			for (const digit of String(part))
				await page.getByTestId(`checkout-keypad-key-${digit}`).click();
			await expect
				.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 10_000 })
				.toBe(part);
			await clickAndExpectPaymentWrite(page, 'checkout-commit', first.till.orderId, 'record');
			await expect
				.poll(() => readAmountMinor(page, 'checkout-balance'), { timeout: 60_000 })
				.toBe(balance - part);
			const paid = await pollOrder(
				request,
				testInfo,
				authorization,
				first.till.orderId,
				(o) => ledgerRows(o).length === 1,
				'the server must record the first cash leg'
			);
			const leg = ledgerRows(paid)[0];
			expect(leg.status).toBe('captured');

			await checkoutControl(page, await checkoutSurface(page), 'close').click();
			const chip = page.getByTestId('cart-customer-name');
			const unlocked = await becomesVisible(chip, 15_000);
			expect(
				unlocked,
				'cart is locked after a partial payment: no customer chip after closing checkout'
			).toBe(true);
			await pickCustomer(page, customer);
			await awaitRetax(page, first.till.total);
			const second = await checkout(page, trackOrder, `${label} after the customer`);
			expectRetaxed(first.till.sent, second.till.sent, s);
			// The due proof: the till's balance is the new total less the captured leg.
			const due = await readAmountMinor(page, 'checkout-balance');
			expect(due, 'still due = new till total − captured').toBe(
				Math.round((Number(second.till.total) - Number(leg.amount)) * 10 ** s.dp)
			);
			const moved = await readOrder(request, testInfo, authorization, first.till.orderId);
			expect(ledgerRows(moved)[0], 'the captured leg is unchanged').toMatchObject({
				amount: leg.amount,
				status: 'captured',
			});

			await payRest(page, cash, first.till.orderId, divergence);
			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				first.till.orderId,
				(o) => ledgerRows(o).length === 2,
				'the server must record both cash legs'
			);
			expectOrderPaid(server);
			expectServerIsTill(server, second.till, label);
			expect(ledgerRows(server)[0], 'the first leg is kept').toMatchObject({
				id: leg.id,
				amount: leg.amount,
				status: 'captured',
			});
		}
	);
});
