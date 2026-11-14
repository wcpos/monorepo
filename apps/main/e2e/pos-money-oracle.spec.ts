import { expect, type Page } from '@playwright/test';

import { tryAddProductBySku } from './fixtures';
import { addCheckoutProbeProduct } from './checkout-probe';
import { fillKeypadField } from './keypad-field';
import { assertMixedTaxTreatment, type GuardLine } from './money-oracle-guards';
import {
	assertSaleParity,
	captureDivergenceLog,
	expectNoBanner,
	saveAndCapture,
	TAX_CLASS_SKU,
} from './money-oracle-sale';
import { liveOrderTest as liveTest, newRunLabel, stampRunLabel } from './order-lifecycle';

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
 *     contract for per-rate `taxes[]` is only observable when a line's tax extends
 *     beyond the store's display precision. On a 2-decimal store, prices of 7.00
 *     and 2.00 at 10% yield 0.70 and 0.20 — identical under the correct rule and
 *     under the bug. The oracle passed for months on arithmetic that could not
 *     discriminate.
 *
 * So this spec MINTS its own adversarial amounts through the POS UI (misc product,
 * fee, shipping — all of which take a cashier-entered amount) instead of hoping the
 * store's catalogue supplies one, and then DECLARES whether the run actually
 * exercised a beyond-display-precision tax component. A green run that never
 * produced one is reported as uncovered rather than counted as proof — see
 * `assertDiscriminating`.
 *
 * Store-agnostic by construction: it asserts the two sides of its OWN sale against
 * each other and never against a fixture value, so it holds on any store, at any
 * tax rate, with any catalogue. Its one environmental dependency is that the store
 * charges *some* tax beyond its display precision; that is measured, not assumed.
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
} as const;

async function openCartMenuAndClick(page: Page, menuItemTestId: string) {
	await page.getByTestId('add-cart-item-menu').click();
	const menuItem = page.getByTestId(menuItemTestId);
	await expect(menuItem).toBeVisible({ timeout: 5_000 });
	await menuItem.click();
}

/**
 * Enter an amount into a form's `AmountField` (money or percent): on web, the price keypad its
 * outlined field grows into (`fillKeypadField`). Type `.` for the decimal: the keypad takes
 * the store's separator or a dot (dev-free is fr_FR and shows `9,99`).
 *
 * The read-back below is not decoration. An earlier version of this file drove a numpad
 * whose value did not live in the input, and the whole oracle went green against a
 * deliberately un-fixed client: the fee was added at its default 0.00, its taxes were 0
 * on both sides, and 0 === 0 passes. The [money-oracle] log line is what exposed it:
 *
 *     [money-oracle] fee cart fee_lines[0] sent=[{"id":6,"total":"0"}]
 *                                        server=[{"id":6,"total":"0.000000"}]
 *
 * So this helper asserts the amount actually landed, at the point of interaction,
 * instead of letting a silent no-op surface three steps later as a green test.
 */
async function fillCurrencyField(page: Page, testID: string, value: string) {
	await fillKeypadField(page, testID, value);
	const field = page.getByTestId(testID);

	// The field renders the committed amount, formatted. Locale-agnostic on purpose:
	// dev-free is fr_FR and formats "1,00", so this asserts "a non-zero digit is showing"
	// rather than an exact string. Every amount this file mints has one.
	await expect(
		field,
		`${testID}: the field committed nothing — it still shows no non-zero digit after ` +
			`entering "${value}". The amount never reached the form, so any assertion ` +
			`downstream would be comparing zero against zero.`
	).toHaveText(/[1-9]/, { timeout: 10_000 });
}

async function addMiscProduct(page: Page, price: string, taxStatus?: 'taxable' | 'none') {
	await openCartMenuAndClick(page, 'menu-add-misc-product');
	// testID, not getByRole('dialog') — the role selector can match any other open
	// dialog, and this suite selects app UI by stable testID only.
	const dialog = page.getByTestId('add-misc-product-dialog');
	await expect(dialog).toBeVisible({ timeout: 15_000 });
	// The dialog defers its auto-focus to the first field (Name); wait for focus to settle inside
	// it, or that focus move lands after the price click and pulls focus out of the price field.
	await expect
		.poll(
			() =>
				page.evaluate(
					() => document.activeElement?.closest('[data-testid="add-misc-product-dialog"]') != null
				),
			{ timeout: 15_000 }
		)
		.toBe(true);
	await fillCurrencyField(page, 'misc-product-price-input', price);
	if (taxStatus) {
		// Tax is ONE select (TaxSelect): Not taxable, then the store's classes.
		await page.getByTestId('misc-product-tax-select').click();
		const value = taxStatus === 'none' ? 'status:none' : 'class:standard';
		const option = page.getByTestId(`misc-product-tax-select-option-${value}`);
		await expect(option).toBeVisible({ timeout: 10_000 });
		await option.click();
	}
	await page.getByTestId('add-to-cart-submit').click();
	await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/** Adds a quick discount through the cashier's fixed-amount or percent field. */
async function addQuickDiscount(page: Page, amount: string, percent = false) {
	await openCartMenuAndClick(page, 'menu-add-discount');
	const dialog = page.getByTestId('add-discount-dialog');
	await expect(dialog).toBeVisible({ timeout: 15_000 });
	if (percent) await page.getByTestId('discount-percent-switch').click();
	await fillCurrencyField(page, 'discount-amount-input', amount);
	await page.getByTestId('add-discount-submit').click();
	await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/** Adds a fixed-amount fee. `prices_include_tax` defaults ON — the cashier's default. */
async function addFee(page: Page, amount: string) {
	await openCartMenuAndClick(page, 'menu-add-fee');
	const dialog = page.getByTestId('add-fee-dialog');
	await expect(dialog).toBeVisible({ timeout: 15_000 });
	await fillCurrencyField(page, 'fee-amount-input', amount);
	await page.getByTestId('add-to-cart-submit').click();
	await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/** Adds a shipping line. `prices_include_tax` defaults ON — the cashier's default. */
async function addShipping(page: Page, amount: string) {
	await openCartMenuAndClick(page, 'menu-add-shipping');
	const dialog = page.getByTestId('add-shipping-dialog');
	await expect(dialog).toBeVisible({ timeout: 15_000 });
	await fillCurrencyField(page, 'shipping-amount-input', amount);
	await page.getByTestId('add-to-cart-submit').click();
	await expect(dialog).toBeHidden({ timeout: 15_000 });
}

liveTest.describe('POS money oracle — line taxes survive the round trip (live store)', () => {
	liveTest(
		'a cart with a fee saves with identical per-rate taxes',
		async ({ posPage: page, trackOrder }, testInfo) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addCheckoutProbeProduct(page);
			await addFee(page, ADVERSARIAL.fee);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label, testInfo);
			assertSaleParity(sale, page, 'fee_lines', 'fee cart');
			await expectNoBanner(page, 'fee cart', divergence);
		}
	);

	liveTest(
		'a cart with a shipping line saves with identical per-rate taxes',
		async ({ posPage: page, trackOrder }, testInfo) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addCheckoutProbeProduct(page);
			await addShipping(page, ADVERSARIAL.shipping);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label, testInfo);
			assertSaleParity(sale, page, 'shipping_lines', 'shipping cart');
			await expectNoBanner(page, 'shipping cart', divergence);
		}
	);

	liveTest(
		'a misc product priced to a beyond-precision tax saves with identical per-rate taxes',
		async ({ posPage: page, trackOrder }, testInfo) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addMiscProduct(page, ADVERSARIAL.miscProduct);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label, testInfo);
			assertSaleParity(sale, page, 'line_items', 'misc-product cart');
			await expectNoBanner(page, 'misc-product cart', divergence);
		}
	);

	/**
	 * A MIXED-TAX-CLASS cart — a standard-rate line, a reduced-rate line, and an
	 * untaxed line in the same sale.
	 *
	 * Until 2026-08-24 no test could build this. Both dev stores carried `reduced-rate`
	 * and `zero-rate` classes with real rates behind them, and not one of ~2,050
	 * published products used either — the classes were live and unreachable. Every
	 * money assertion the suite had ever made ran on the standard class alone.
	 *
	 * This is also the shape the 2.0.0 quick-discount work needs (wcpos/roadmap#91):
	 * the whole correctness argument for moving till discounts to `percent` coupons is
	 * that they allocate pro rata by value across tax classes, and that claim cannot be
	 * tested on a single-class basket.
	 *
	 * Skips with a reason when the fixture SKUs are absent — a store that has not run
	 * `e2e/scripts/tax-class-fixtures.php` is a declared-missing environment, not a
	 * regression.
	 */
	liveTest(
		'a mixed-tax-class cart saves with identical per-rate taxes on every line',
		async ({ posPage: page, trackOrder }, testInfo) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			// All three lines come from OWNED fixtures, including the standard-rate one.
			// `addCheckoutProbeProduct` falls back to an arbitrary catalogue product on a
			// secretless run, and that product may itself be reduced-rate or non-taxable —
			// leaving this cart with a single non-empty rate set and failing the coverage
			// assertion on a perfectly valid store. A spec that needs data creates and
			// targets its own record.
			const added = {
				standard: await tryAddProductBySku(page, TAX_CLASS_SKU.standard),
				reduced: await tryAddProductBySku(page, TAX_CLASS_SKU.reduced),
				nonTaxable: await tryAddProductBySku(page, TAX_CLASS_SKU.nonTaxable),
			};
			const missing = Object.entries(added).filter(([, outcome]) => outcome !== 'added');
			if (missing.length > 0) {
				liveTest.skip(
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
		}
	);
	/**
	 * QUICK DISCOUNTS are coupon lines: WooCommerce's contra-revenue primitive,
	 * which recomputes each line's tax on its discounted base. On tax-inclusive
	 * stores the discount acts on gross amounts, preserving the correct tax base.
	 *
	 * `percent` discounts every line at the same rate, pro rata by value;
	 * `fixed_cart` allocates equally per unit with WooCommerce's remainder loop.
	 * The mixed taxable / non-taxable cart discriminates the allocation: the untaxed
	 * line takes its share of the fixed discount but draws no tax.
	 *
	 * These cases pin the SERVER's application of the app's virtual-coupon line,
	 * including its echoed intent, not just the client's discount calculation.
	 * Per-rate taxes live on `line_items`, not `coupon_lines`.
	 * See wcpos/roadmap#91, woocommerce-pos#1927, monorepo#1932.
	 *
	 * WooCommerce allocates a coupon in whole cents per line, so the discounted base is always a
	 * whole-cent amount and a rate that divides it evenly (dev-free: one 10% rate on a 25.00 probe
	 * product → 2.25) leaves every per-rate tax whole and the discriminating guard NOT COVERED.
	 * The 9.99 misc line (0.899 at 10%, 1.798 at 20%) keeps one sub-cent tax on the sale under
	 * any whole-percent rate, so the rounding leg is exercised on every lane (2026-11-02).
	 */
	liveTest(
		'a percent quick discount is a coupon line: pro-rata across a mixed taxable / non-taxable cart',
		async ({ posPage: page, trackOrder }, testInfo) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addCheckoutProbeProduct(page);
			await addMiscProduct(page, ADVERSARIAL.miscProduct);
			await addMiscProduct(page, ADVERSARIAL.nonTaxable, 'none');
			await addQuickDiscount(page, '10', true);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label, testInfo);
			assertSaleParity(sale, page, 'line_items', 'percent quick-discount cart');
			expect(sale.doc.coupon_lines).toEqual([
				expect.objectContaining({
					code: 'pos-discount',
					discount_type: 'percent',
					meta_data: expect.arrayContaining([
						expect.objectContaining({
							key: '_wcpos_quick_discount',
							value: { discount_type: 'percent', amount: '10' },
						}),
					]),
				}),
			]);
			expect(Number(sale.doc.discount_total)).toBeGreaterThan(0);
			await expectNoBanner(page, 'percent quick-discount cart', divergence);
		}
	);
	liveTest(
		'a fixed quick discount is a coupon line: equal-per-unit across a mixed taxable / non-taxable cart',
		async ({ posPage: page, trackOrder }, testInfo) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addCheckoutProbeProduct(page);
			await addMiscProduct(page, ADVERSARIAL.miscProduct);
			await addMiscProduct(page, ADVERSARIAL.nonTaxable, 'none');
			await addQuickDiscount(page, ADVERSARIAL.fee);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label, testInfo);
			assertSaleParity(sale, page, 'line_items', 'fixed quick-discount cart');
			expect(sale.doc.coupon_lines).toEqual([
				expect.objectContaining({
					code: 'pos-discount',
					discount_type: 'fixed_cart',
					meta_data: expect.arrayContaining([
						expect.objectContaining({
							key: '_wcpos_quick_discount',
							value: { discount_type: 'fixed_cart', amount: ADVERSARIAL.fee },
						}),
					]),
				}),
			]);
			expect(Number(sale.doc.discount_total)).toBeGreaterThan(0);
			await expectNoBanner(page, 'fixed quick-discount cart', divergence);
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
		async ({ posPage: page, trackOrder }, testInfo) => {
			const label = newRunLabel();
			const divergence = captureDivergenceLog(page);
			await addCheckoutProbeProduct(page);
			await addMiscProduct(page, ADVERSARIAL.miscProduct);
			await addFee(page, ADVERSARIAL.fee);
			await addShipping(page, ADVERSARIAL.shipping);
			await stampRunLabel(page, label);

			const sale = await saveAndCapture(page, trackOrder, label, testInfo);
			assertSaleParity(sale, page, 'fee_lines', 'full cart');
			await expectNoBanner(page, 'full cart', divergence);
		}
	);
});
