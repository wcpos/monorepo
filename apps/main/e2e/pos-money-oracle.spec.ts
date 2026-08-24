import { expect, type Page } from '@playwright/test';

import { addCheckoutProbeProduct } from './checkout-probe';
import {
	expectMoneyMatches,
	expectRateSetParity,
	expectTaxParity,
	isPushOrdersResponse,
	liveOrderTest as liveTest,
	newRunLabel,
	type OrderPayload,
	posAppliedRateIds,
	readCartMoney,
	type ServerOrder,
	stampRunLabel,
} from './order-lifecycle';

/**
 * THE MONEY ORACLE — every money field the POS authors, compared against what the
 * store actually stored, on carts that contain a FEE and a SHIPPING line and not
 * only products.
 *
 * WHY THIS FILE EXISTS. The save-to-server parity oracle in `pos-cart.spec.ts` has
 * been armed and passing since woocommerce-pos#1545, and it never saw the bug that
 * reached a merchant on 2026-08-24 (order 111919 on dev-free, CHECKOUT401: client
 * `fee_lines[…].taxes[6].total` 0.090000 against the server's 0.090909). It could
 * not see it, for two independent reasons — both of which this file closes:
 *
 *  1. **It only ever rings up products.** `pos-cart.spec.ts` builds its cart with
 *     `addCheckoutProbeProduct` and nothing else. The fee and shipping paths had
 *     E2E coverage that stopped at "the line appeared in the cart"
 *     (`pos-cart.spec.ts` → "should add a fee via the dropdown menu"): no save, no
 *     push, no comparison. An e2e that never submits proves nothing.
 *
 *  2. **Its amounts are whatever the catalogue happens to cost.** The rounding
 *     contract for per-rate `taxes[]` is only observable when a line's tax is NOT a
 *     whole number of cents. A store whose products are priced 7.00 and 2.00 at 10%
 *     yields 0.70 and 0.20 — identical under the correct rule and under the bug. The
 *     oracle passed for months on arithmetic that could not discriminate.
 *
 * So this spec MINTS its own adversarial amounts through the POS UI (misc product,
 * fee, shipping — all of which take a cashier-entered amount) instead of hoping the
 * store's catalogue supplies one, and then DECLARES whether the run actually
 * exercised a sub-cent tax component. A green run that never produced one is
 * reported as uncovered rather than counted as proof — see `assertDiscriminating`.
 *
 * Store-agnostic by construction: it asserts the two sides of its OWN sale against
 * each other and never against a fixture value, so it holds on any store, at any
 * tax rate, with any catalogue. Its one environmental dependency is that the store
 * charges *some* tax with a sub-cent component; that is measured, not assumed.
 */

/** Amounts whose tax is a repeating decimal at every common rate (7/9/10/17/19/20/21%). */
const ADVERSARIAL = {
	/** 1.00 incl. 10% → net 0.909091, tax 0.090909 — the exact shape of order 111919. */
	fee: '1',
	/** 3.33 incl. 20% → net 2.775, tax 0.555 — sub-cent at the third decimal. */
	shipping: '3.33',
	/** 9.99 → 0.999 at 10%, 1.9998 at 20%, 2.0979 at 21%. Never a whole cent. */
	miscProduct: '9.99',
	/** A NON-taxable line, sized to take a substantial share of the class mix. */
	nonTaxable: '5',
};

async function openCartMenuAndClick(page: Page, menuItemTestId: string) {
	await page.getByTestId('add-cart-item-menu').click();
	const menuItem = page.getByTestId(menuItemTestId);
	await expect(menuItem).toBeVisible({ timeout: 5_000 });
	await menuItem.click();
}

/**
 * Type an amount into a `CurrencyInput`, which opens a numpad popover rather than
 * accepting keystrokes in place.
 *
 * MUST type, never `fill()`. The numpad's value does not live in the input element:
 * `Numpad` holds it in `useCalculator` state fed by `onKeyPress`
 * (packages/components/src/numpad/index.tsx), and the Done button reads that state
 * via `numpadRef.current.getValue()`. `fill()` sets `.value` and dispatches a single
 * `input` event — no per-character key events — so the calculator never sees a digit
 * and Done commits the INITIAL value.
 *
 * That is not a hypothetical. The first version of this file used `fill()`, and the
 * whole oracle went green against a deliberately un-fixed client: the fee was added
 * at its default 0.00, its taxes were 0 on both sides, and 0 === 0 passes. The
 * [money-oracle] log line is what exposed it:
 *
 *     [money-oracle] fee cart fee_lines[0] sent=[{"id":6,"total":"0"}]
 *                                        server=[{"id":6,"total":"0.000000"}]
 *
 * Hence the read-back below: this helper asserts the amount actually landed, at the
 * point of interaction, instead of letting a silent no-op surface three steps later
 * as a green test.
 */
async function fillCurrencyField(
	page: Page,
	testID: string,
	value: string,
	options: { negative?: boolean } = {}
) {
	const field = page.getByTestId(testID);
	await expect(field).toBeVisible({ timeout: 15_000 });
	await field.click();
	const numpad = page.locator('[data-radix-popper-content-wrapper]').first();
	await expect(numpad).toBeVisible({ timeout: 15_000 });
	// Press the numpad's own KEYS, one per character. Two reasons this is not typing
	// into the input:
	//
	//  - The numpad's value lives in `useCalculator` state, not the input element (see
	//    above), so the keys are the only interaction that actually moves it.
	//  - The decimal character is the STORE's separator. dev-free is fr_FR and renders
	//    a "," key, so a typed "." is dropped by `handleKeyPress` — "9.99" silently
	//    becomes 999. Digit keys carry stable testIDs already; the separator carries
	//    the role-based `numpad-key-decimal` so this works on any store's locale.
	for (const character of value) {
		const key =
			character === '.' || character === ','
				? numpad.getByTestId('numpad-key-decimal')
				: numpad.getByTestId(`numpad-key-${character}`);
		await expect(key, `numpad key for "${character}" is missing`).toBeVisible({ timeout: 5_000 });
		await key.click();
	}
	if (options.negative) {
		const sign = numpad.getByTestId('numpad-key-icon-plusMinus');
		await expect(sign, 'numpad +/- key is missing').toBeVisible({ timeout: 5_000 });
		await sign.click();
	}
	await page.getByTestId('numpad-done-button').click();

	// The trigger renders the committed amount. Locale-agnostic on purpose: dev-free
	// is fr_FR and formats "1,00", so this asserts "a non-zero digit is showing"
	// rather than an exact string. Every amount this file mints has one.
	await expect(
		field,
		`${testID}: the numpad committed nothing — the trigger still shows no non-zero ` +
			`digit after entering "${value}". The amount never reached the form, so any ` +
			`assertion downstream would be comparing zero against zero.`
	).toHaveText(/[1-9]/, { timeout: 10_000 });
}

async function addMiscProduct(page: Page, price: string, taxStatus?: 'taxable' | 'none') {
	await openCartMenuAndClick(page, 'menu-add-misc-product');
	await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
	await fillCurrencyField(page, 'misc-product-price-input', price);
	if (taxStatus) {
		const option = page.getByTestId(`tax_status-option-${taxStatus}`);
		await expect(option).toBeVisible({ timeout: 10_000 });
		await option.click();
	}
	await page.getByTestId('add-to-cart-submit').click();
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
}

/**
 * A NEGATIVE fee — entered the way a cashier does, with the numpad's +/- key.
 *
 * WooCommerce treats a negative fee as a discount and taxes it on a completely
 * different code path (`WC_Order_Item_Fee::calculate_taxes()`): instead of applying
 * the fee's own tax class to the whole amount, it apportions the amount across the
 * tax-class mix of every POSITIVE line in the order — including a `non-taxable`
 * bucket that draws no tax at all.
 */
async function addNegativeFee(page: Page, amount: string) {
	await openCartMenuAndClick(page, 'menu-add-fee');
	await expect(page.getByTestId('add-fee-dialog')).toBeVisible({ timeout: 15_000 });
	await fillCurrencyField(page, 'fee-amount-input', amount, { negative: true });
	await page.getByTestId('add-to-cart-submit').click();
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
}

/** Adds a fixed-amount fee. `prices_include_tax` defaults ON — the cashier's default. */
async function addFee(page: Page, amount: string) {
	await openCartMenuAndClick(page, 'menu-add-fee');
	await expect(page.getByTestId('add-fee-dialog')).toBeVisible({ timeout: 15_000 });
	await fillCurrencyField(page, 'fee-amount-input', amount);
	await page.getByTestId('add-to-cart-submit').click();
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
}

/** Adds a shipping line. `prices_include_tax` defaults ON — the cashier's default. */
async function addShipping(page: Page, amount: string) {
	await openCartMenuAndClick(page, 'menu-add-shipping');
	await expect(page.getByTestId('add-shipping-dialog')).toBeVisible({ timeout: 15_000 });
	await fillCurrencyField(page, 'shipping-amount-input', amount);
	await page.getByTestId('add-to-cart-submit').click();
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
}

type SavedSale = {
	sent: OrderPayload;
	doc: ServerOrder;
	cartTotal: string;
};

/** Save the open cart and return both sides of the sale. */
async function saveAndCapture(
	page: Page,
	trackOrder: (order: { id: number; uuid?: string; label?: string }) => void,
	label: string
): Promise<SavedSale> {
	// The till's own aggregate, captured BEFORE the click: the ack is adopted into
	// the resident order, so a read taken afterwards can compare the server's total
	// against itself and go green whatever the server did (pos-cart.spec.ts).
	const cart = await readCartMoney(page);

	const saved = page.waitForResponse((response) => isPushOrdersResponse(response), {
		timeout: 90_000,
	});
	saved.catch(() => {});

	await page.getByTestId('save-to-server-button').click();
	const response = await saved;
	expect(response.status(), 'save to server must succeed').toBeLessThan(400);

	const envelope = (response.request().postDataJSON() ?? {}) as {
		recordId?: string;
		payload?: OrderPayload;
	};
	const sent = envelope.payload ?? {};
	const ack = (await response.json().catch(() => null)) as { document?: ServerOrder } | null;
	const doc = ack?.document;
	expect(doc?.id, 'ack must carry the created order').toBeTruthy();
	trackOrder({ id: Number(doc!.id), uuid: envelope.recordId, label });

	return { sent, doc: doc!, cartTotal: cart.total };
}

type LineWithTaxes = { taxes?: { id?: unknown; total?: unknown; subtotal?: unknown }[] };

function linesOf(payload: Record<string, unknown>, key: string): LineWithTaxes[] {
	const value = payload[key];
	return Array.isArray(value) ? (value as LineWithTaxes[]) : [];
}

/**
 * Did this sale actually exercise the per-rate rounding contract?
 *
 * A per-rate tax that lands on a whole cent (0.700000) is identical whether the
 * client rounds `taxes[]` to display decimals or stores them raw — it cannot fail
 * either way. Counting such a run as proof is how the bug survived: every fixture
 * amount in the suite was 2dp-clean.
 *
 * So coverage is DECLARED, never assumed. A run on a tax-free store, or one whose
 * rates divide the minted amounts evenly, reports itself as uncovered instead of
 * passing silently.
 */
function assertDiscriminating(doc: ServerOrder, underTest: string, label: string) {
	const perRate: string[] = [];
	for (const line of linesOf(doc as unknown as Record<string, unknown>, underTest)) {
		for (const tax of line.taxes ?? []) {
			const text = String(tax?.total ?? '').trim();
			if (text !== '') perRate.push(text);
		}
	}
	expect(
		perRate.length,
		`${label}: the sale recorded no per-rate taxes on ${underTest} at all`
	).toBeGreaterThan(0);

	// Sub-cent content: the value differs from its own 2dp rounding. That is exactly
	// the difference the bug erased.
	//
	// Scoped to the LINE TYPE UNDER TEST, not to the order. An order-wide check is a
	// proxy for the claim, and it passes on the wrong evidence: if the fee silently
	// lands at 0.00 (a numpad interaction that did not take), its taxes are 0 on both
	// sides and compare equal, while the probe PRODUCT's sub-cent tax satisfies an
	// order-wide check — a fee scenario that green-lights without ever exercising a
	// fee. Assert on the thing, never on something correlated with it.
	// NUMERIC comparison, deliberately. The first version of this line compared
	// `Number(text).toFixed(2) !== Number(text).toFixed(6)` — two strings of different
	// WIDTH, so "0.70" !== "0.700000" was true for every value ever passed and the
	// guard declared full coverage on carts whose taxes were all whole cents. A
	// coverage check that cannot return false is worse than no check: it reads, in the
	// report, exactly like a real one.
	const subCent = perRate.filter((text) => Number(Number(text).toFixed(2)) !== Number(text));
	expect(
		subCent.length,
		`${label}: NOT COVERED — every per-rate tax on this sale's ${underTest} is a whole ` +
			`cent (${perRate.join(', ')}), so this run cannot distinguish rounded per-rate ` +
			`taxes from raw ones. Either the amount never reached the line (check the ` +
			`[money-oracle] log lines above for a 0 total) or this store's rates divide it ` +
			`evenly. Do NOT read this run as proof.`
	).toBeGreaterThan(0);
}

/** The line-level money slots the POS authors and the server must keep verbatim. */
const LINE_MONEY_KEYS = ['total', 'subtotal'] as const;
/** Line-level slots that are SERVER-COMPUTED, so they carry the rounding-tie tolerance. */
const LINE_TAX_KEYS = ['total_tax', 'subtotal_tax'] as const;

/**
 * Line-by-line, field-by-field parity — deliberately INDEPENDENT of the app's own
 * `compareOrderMoney`.
 *
 * The app runs that comparator on every push and raises the banner from its result;
 * `expectNoBanner` below is therefore already an end-to-end check of it. Importing
 * it here as well would make this oracle inherit its blind spots: if it ever stopped
 * walking `fee_lines[].taxes[]`, both the app AND the test would go quiet together.
 * This walk is hand-rolled for exactly that reason — two independent witnesses.
 *
 * `expectTaxParity` carries the measured one-microunit rounding-tie tolerance for
 * computed taxes; 0.090000 against 0.090909 is 909 microunits and fails. Amounts the
 * POS authored outright (`total`, `subtotal`) get `expectMoneyMatches` — exact.
 */
function expectPerRateTaxParity(sale: SavedSale, label: string) {
	for (const key of ['line_items', 'fee_lines', 'shipping_lines']) {
		const sentLines = linesOf(sale.sent as Record<string, unknown>, key);
		const serverLines = linesOf(sale.doc as unknown as Record<string, unknown>, key);
		expect(serverLines.length, `${label}: server ${key} count`).toBe(sentLines.length);

		sentLines.forEach((sentLine, index) => {
			const serverLine = serverLines[index];
			const sentRecord = sentLine as Record<string, unknown>;
			const serverRecord = serverLine as unknown as Record<string, unknown>;

			for (const money of LINE_MONEY_KEYS) {
				if (sentRecord[money] === undefined) continue;
				expectMoneyMatches(
					serverRecord[money],
					sentRecord[money],
					`${label}: ${key}[${index}].${money}`
				);
			}
			for (const tax of LINE_TAX_KEYS) {
				if (sentRecord[tax] === undefined) continue;
				expectTaxParity(serverRecord[tax], sentRecord[tax], `${label}: ${key}[${index}].${tax}`);
			}

			const serverByRate = new Map(
				(serverLine?.taxes ?? []).map((tax) => [String(tax?.id ?? ''), tax])
			);

			// The per-rate values BOTH sides hold, logged for every run whether it
			// passes or fails. Paul's ask: every important calculation grounded in
			// tests AND logs. A silent green run cannot be audited after the fact —
			// this line is how you check the oracle actually compared something.
			console.log(
				`[money-oracle] ${label} ${key}[${index}] ` +
					`sent=${JSON.stringify(sentLine.taxes ?? null)} ` +
					`server=${JSON.stringify(serverLine?.taxes ?? null)}`
			);

			// Both sides must AGREE about having taxes. An untaxed line legitimately has
			// none on either side — a non-taxable misc product is exactly that, and it is
			// how the negative-fee case builds its class mix. What must never pass quietly
			// is one side carrying taxes the other does not: a client that stopped sending
			// line taxes would otherwise sail through the per-rate loop below, which
			// iterates the CLIENT's array and would simply have nothing to iterate.
			expect(
				(sentLine.taxes ?? []).length === 0,
				`${label}: ${key}[${index}] — the client sent ` +
					`${(sentLine.taxes ?? []).length} per-rate taxes and the server holds ` +
					`${(serverLine?.taxes ?? []).length}. One side is taxing this line and the ` +
					`other is not.`
			).toBe((serverLine?.taxes ?? []).length === 0);

			for (const sentTax of sentLine.taxes ?? []) {
				const rate = String(sentTax?.id ?? '');
				const serverTax = serverByRate.get(rate);
				expect(
					serverTax,
					`${label}: ${key}[${index}] rate ${rate} missing from the ack`
				).toBeTruthy();
				expectTaxParity(
					serverTax!.total,
					sentTax.total,
					`${label}: ${key}[${index}].taxes[${rate}].total`
				);
			}
		});
	}
}

function assertSaleParity(sale: SavedSale, page: Page, underTest: string, label: string) {
	assertDiscriminating(sale.doc, underTest, label);
	expectRateSetParity(
		posAppliedRateIds(sale.sent),
		sale.doc.tax_lines,
		`${label}: server tax rates must equal the rates the POS applied`
	);
	expectPerRateTaxParity(sale, label);
	expectMoneyMatches(sale.doc.total, sale.cartTotal, `${label}: order total (cart vs server)`);
	return page;
}

/**
 * The cashier-facing alarm. Parity is the invariant; this banner is what the
 * merchant actually sees when it breaks — the yellow "your store changed this
 * order's totals" box. Asserted after the save button re-enables so the
 * reconciliation that raises it has already run.
 */
async function expectNoBanner(page: Page, label: string, divergence: () => string[]) {
	await expect(page.getByTestId('save-to-server-button')).toBeEnabled({ timeout: 30_000 });
	const logged = divergence();
	await expect(
		page.getByTestId('order-totals-changed-banner'),
		`${label}: a correctly rung sale must not trigger the totals-changed banner.\n` +
			(logged.length
				? `The app's own comparator named these fields:\n  ${logged.join('\n  ')}`
				: `No push.money-divergence entry was logged — the banner is up for another reason.`)
	).not.toBeVisible();
}

/**
 * Collect the app's own `push.money-divergence` entries from the browser console.
 *
 * The independent walk above compares the slots this spec knows to look at; the app's
 * comparator walks EVERY money slot and is what actually raises the banner. When the
 * two disagree — parity green, banner up — the fields the app named are the whole
 * diagnosis, and without them the failure reads "a banner appeared" and tells you
 * nothing. That is the difference between a test that reports a symptom and one that
 * reports a cause.
 */
function captureDivergenceLog(page: Page): () => string[] {
	const entries: string[] = [];
	page.on('console', (message) => {
		const text = message.text();
		if (!text.includes('money-divergence')) return;
		// The log line carries `divergentFields` / `detail`; keep it whole rather than
		// re-parsing a shape that is free to change.
		entries.push(text.replace(/\s+/g, ' ').trim());
	});
	return () => [...entries];
}

liveTest.describe('POS money oracle — line taxes survive the round trip (live store)', () => {
	liveTest(
		'a cart with a fee saves with identical per-rate taxes',
		async ({ posPage: page, trackOrder }) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addCheckoutProbeProduct(page);
			await addFee(page, ADVERSARIAL.fee);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label);
			assertSaleParity(sale, page, 'fee_lines', 'fee cart');
			await expectNoBanner(page, 'fee cart', divergence);
		}
	);

	liveTest(
		'a cart with a shipping line saves with identical per-rate taxes',
		async ({ posPage: page, trackOrder }) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addCheckoutProbeProduct(page);
			await addShipping(page, ADVERSARIAL.shipping);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label);
			assertSaleParity(sale, page, 'shipping_lines', 'shipping cart');
			await expectNoBanner(page, 'shipping cart', divergence);
		}
	);

	liveTest(
		'a misc product priced to a sub-cent tax saves with identical per-rate taxes',
		async ({ posPage: page, trackOrder }) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addMiscProduct(page, ADVERSARIAL.miscProduct);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label);
			assertSaleParity(sale, page, 'line_items', 'misc-product cart');
			await expectNoBanner(page, 'misc-product cart', divergence);
		}
	);

	/**
	 * NEGATIVE FEE — the POS override, NOT WooCommerce's discount path.
	 *
	 * `WC_Order_Item_Fee::calculate_taxes()` branches on the sign: a negative fee is
	 * treated as a discount and apportioned across the tax-class mix of every positive
	 * line, ignoring the fee's own `tax_status` and `tax_class` entirely. **The POS
	 * plugin deliberately undoes that.** `WCPOS\WooCommercePOS\Orders::fee_after_calculate_taxes()`
	 * hooks `woocommerce_order_item_fee_after_calculate_taxes` and, for any POS order,
	 * recomputes the tax from the fee's OWN tax class — or clears it when the fee's
	 * `tax_status` is `none`. So on a POS order the apportionment runs and is then
	 * replaced, and the client is right to apply the fee's own class.
	 *
	 * This test therefore locks the OVERRIDE, not the apportionment. It goes red if the
	 * plugin-side hook stops firing — the order gate loosens, the POS marker is dropped
	 * from the v2 push's inner wc/v3 forward, the hook is removed — any of which would
	 * silently hand negative-fee tax back to WooCommerce and start diverging from every
	 * till that rang one up.
	 *
	 * The cart mixes a taxable line with a NON-taxable one on purpose: that is the shape
	 * where apportionment and the override give different answers, so a green here means
	 * the override is genuinely in force rather than the two happening to agree.
	 *
	 * The override is a STOPGAP with a ruling behind it (woocommerce-pos
	 * .claude/research/2026-08-06-wc-negative-fee-tax.md): on a tax-INCLUSIVE store it
	 * charges the customer the right amount but over-declares VAT, while WooCommerce's
	 * own behaviour charges the wrong amount. Neither is defensible there; the plan of
	 * record is migrating till discounts to coupon lines. When that lands, this test
	 * changes with it — it pins today's contract, not a permanent truth.
	 */
	liveTest(
		'a negative fee is taxed from its OWN class (the POS override, not WC apportionment)',
		async ({ posPage: page, trackOrder }) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addCheckoutProbeProduct(page);
			await addMiscProduct(page, ADVERSARIAL.nonTaxable, 'none');
			await addNegativeFee(page, ADVERSARIAL.fee);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label);
			assertSaleParity(sale, page, 'fee_lines', 'negative-fee cart');
			await expectNoBanner(page, 'negative-fee cart', divergence);
		}
	);
	/**
	 * The full cart — product + fee + shipping together. This is the shape of order
	 * 111919, and it is the one that catches cross-line effects: `cart_tax` and
	 * `total_tax` aggregate over all three line types, so a per-line rounding error
	 * that happens to cancel on a single-line cart still shows up here.
	 */
	liveTest(
		'a product + fee + shipping cart saves with identical money throughout',
		async ({ posPage: page, trackOrder }) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addCheckoutProbeProduct(page);
			await addMiscProduct(page, ADVERSARIAL.miscProduct);
			await addFee(page, ADVERSARIAL.fee);
			await addShipping(page, ADVERSARIAL.shipping);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label);
			assertSaleParity(sale, page, 'fee_lines', 'full cart');
			await expectNoBanner(page, 'full cart', divergence);
		}
	);
});
