import { ReceiptDataSchema } from '@wcpos/printer/encoder';

import {
	applyScenarioState,
	createScenarioState,
	mergeScenarioOverrides,
	SCENARIO_CHIPS,
	toggleScenarioOverride,
} from '../scenario-controls';
import { createRandomReceipt } from '../randomizer';

import type { ScenarioKey } from '../scenario-controls';

describe('scenario controls', () => {
	const allKeys: ScenarioKey[] = [
		'emptyCart',
		'refund',
		'rtl',
		'multicurrency',
		'multiPayment',
		'fiscal',
		'longNames',
		'hasDiscounts',
		'hasFees',
		'hasShipping',
		'taxBreakdown',
		'customerDetails',
		'giftReceipt',
		'barcodeQr',
	];

	function fullReceipt() {
		return createRandomReceipt({
			seed: 'scenario-controls',
			overrides: {
				emptyCart: false,
				refund: true,
				rtl: false,
				multicurrency: false,
				multiPayment: true,
				fiscal: true,
				longNames: true,
				hasDiscounts: true,
				hasFees: true,
				hasShipping: true,
				cartSize: 3,
			},
		}).data;
	}

	it('defines every chip type in display order', () => {
		expect(SCENARIO_CHIPS.map((chip) => chip.key)).toEqual(allKeys);
	});

	it('normalizes randomizer scenarios into every chip state', () => {
		const receipt = fullReceipt();
		const randomizerState = createRandomReceipt({ seed: 1 }).scenarios;
		const state = createScenarioState(randomizerState, receipt);

		expect(Object.keys(state)).toEqual(allKeys);
		expect(typeof state.taxBreakdown).toBe('boolean');
		expect(typeof state.customerDetails).toBe('boolean');
		expect(typeof state.giftReceipt).toBe('boolean');
		expect(typeof state.barcodeQr).toBe('boolean');
	});

	it('merges and toggles manual overrides without mutating the original override object', () => {
		const baseState = createScenarioState(
			createRandomReceipt({ seed: 2 }).scenarios,
			fullReceipt()
		);
		const overrides = { hasFees: true } as Partial<Record<ScenarioKey, boolean>>;

		expect(mergeScenarioOverrides(baseState, overrides).hasFees).toBe(true);
		expect(toggleScenarioOverride(overrides, 'hasFees', false)).toEqual({ hasFees: false });
		expect(overrides).toEqual({ hasFees: true });
	});

	it('removes and restores fees without changing line items', () => {
		const data = fullReceipt();
		const withoutFees = applyScenarioState(data, {
			...createScenarioState({}, data),
			hasFees: false,
		});
		const withFees = applyScenarioState(withoutFees, {
			...createScenarioState({}, withoutFees),
			hasFees: true,
		});

		expect(withoutFees.fees).toEqual([]);
		expect(withoutFees.lines).toEqual(data.lines);
		expect(withFees.fees.length).toBeGreaterThan(0);
		expect(ReceiptDataSchema.safeParse(withFees).success).toBe(true);
	});

	it('removes and restores shipping and discounts while keeping totals consistent', () => {
		const data = fullReceipt();
		const withoutAdjustments = applyScenarioState(data, {
			...createScenarioState({}, data),
			hasShipping: false,
			hasDiscounts: false,
		});
		const withAdjustments = applyScenarioState(withoutAdjustments, {
			...createScenarioState({}, withoutAdjustments),
			hasShipping: true,
			hasDiscounts: true,
		});

		expect(withoutAdjustments.shipping).toEqual([]);
		expect(withoutAdjustments.discounts).toEqual([]);
		expect(withAdjustments.shipping.length).toBeGreaterThan(0);
		expect(withAdjustments.discounts.length).toBeGreaterThan(0);
		expect(withAdjustments.totals.total_incl).toBeCloseTo(
			withAdjustments.lines.reduce((sum, line) => sum + line.line_total_incl, 0) +
				withAdjustments.fees.reduce((sum, fee) => sum + fee.total_incl, 0) +
				withAdjustments.shipping.reduce((sum, item) => sum + item.total_incl, 0) -
				withAdjustments.discounts.reduce((sum, item) => sum + item.total_incl, 0),
			2
		);
	});

	it('includes item-level discounts when recomputing totals', () => {
		const data = fullReceipt();
		const line = structuredClone(data.lines[0]!);
		line.line_subtotal = 20;
		line.line_subtotal_incl = 20;
		line.line_subtotal_excl = 16;
		line.discounts = 5;
		line.discounts_incl = 5;
		line.discounts_excl = 4;
		line.line_total = 15;
		line.line_total_incl = 15;
		line.line_total_excl = 12;
		data.lines = [line];
		data.fees = [];
		data.shipping = [];
		data.discounts = [];
		data.refunds = [];

		const result = applyScenarioState(data, {
			...createScenarioState({}, data),
			hasFees: false,
			hasShipping: false,
			hasDiscounts: false,
			refund: false,
			taxBreakdown: false,
		});

		expect(result.totals.subtotal_incl).toBe(20);
		expect(result.totals.discount_total_incl).toBe(5);
		expect(result.totals.discount_total_excl).toBe(4);
		expect(result.totals.total_incl).toBe(15);
		expect(result.totals.total_excl).toBe(12);
		expect(result.totals.tax_total).toBe(3);
		expect(ReceiptDataSchema.safeParse(result).success).toBe(true);
	});

	it('uses the fixture currency when toggling multicurrency', () => {
		const data = fullReceipt();
		data.order.currency = 'GBP';

		const state = createScenarioState({}, data);
		const off = applyScenarioState(data, { ...state, multicurrency: false });
		const on = applyScenarioState(data, { ...state, multicurrency: true });

		expect(state.multicurrency).toBe(true);
		expect(off.order.currency).toBe('USD');
		expect(on.order.currency).toBe('GBP');
	});

	it('toggles empty cart and dependent sections', () => {
		const data = fullReceipt();
		const empty = applyScenarioState(data, { ...createScenarioState({}, data), emptyCart: true });
		const populated = applyScenarioState(empty, {
			...createScenarioState({}, empty),
			emptyCart: false,
		});

		expect(empty.lines).toEqual([]);
		expect(empty.fees).toEqual([]);
		expect(empty.shipping).toEqual([]);
		expect(empty.discounts).toEqual([]);
		expect(empty.refunds).toEqual([]);
		expect(empty.totals.total_incl).toBe(0);
		expect(populated.lines.length).toBeGreaterThan(0);
	});

	it('toggles refund, multi-payment, fiscal, barcode, tax breakdown, customer, gift, locale, currency, and long-name data', () => {
		const data = fullReceipt();
		data.order.currency = 'EUR';
		const off = applyScenarioState(data, {
			...createScenarioState({}, data),
			refund: false,
			multiPayment: false,
			fiscal: false,
			barcodeQr: false,
			taxBreakdown: false,
			customerDetails: false,
			giftReceipt: false,
			rtl: false,
			multicurrency: false,
			longNames: false,
		});
		const on = applyScenarioState(data, {
			...createScenarioState({}, data),
			refund: true,
			multiPayment: true,
			fiscal: true,
			barcodeQr: true,
			taxBreakdown: true,
			customerDetails: true,
			giftReceipt: true,
			rtl: true,
			multicurrency: true,
			longNames: true,
		});

		expect(off.refunds).toEqual([]);
		expect(off.payments).toHaveLength(1);
		expect(off.fiscal).toEqual({});
		expect(off.tax_summary).toEqual([]);
		expect(off.customer.billing_address).toEqual({});
		expect(off.presentation_hints.display_tax).not.toBe('hidden');
		expect(off.presentation_hints.locale).toBe('en_US');
		expect(off.order.currency).toBe('USD');
		expect(on.refunds?.length).toBeGreaterThan(0);
		expect(on.payments.length).toBeGreaterThan(1);
		expect(on.fiscal.immutable_id).toBeTruthy();
		expect(on.fiscal.qr_payload).toContain('wcpos://receipt/');
		expect(on.tax_summary.length).toBeGreaterThan(0);
		expect(Object.keys(on.customer.billing_address ?? {}).length).toBeGreaterThan(0);
		expect(on.presentation_hints.display_tax).toBe('hidden');
		expect(on.presentation_hints.locale).toBe('ar_SA');
		expect(on.order.currency).toBe('EUR');
		expect(on.lines[0]?.name.length).toBeGreaterThan(40);
		expect(ReceiptDataSchema.safeParse(on).success).toBe(true);
	});
});
