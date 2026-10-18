import * as api from './index';

test('public value surface is exactly the spec', () => {
	expect(
		Object.keys(api)
			.filter((k) => typeof (api as Record<string, unknown>)[k] === 'function')
			.sort()
	).toEqual([
		'activeAwaitingCustomer',
		'calculateCartLine',
		'createCartConfig',
		'derive',
		'fromMinor',
		'getNetPaymentTotal',
		'hasLiveSettlementLeg',
		'hasSaleProvenance',
		'hasSaleTime',
		'isActiveCouponLine',
		'isActiveFeeLine',
		'isActiveLineItem',
		'isActiveShippingLine',
		'isCompletingStatus',
		'isLivePaymentStatus',
		'mintDevicePayment',
		'mintManualPayment',
		'mintServerPayment',
		'readAwaitingCustomer',
		'readLedger',
		// Added 2026-08-19: the POS cart footer displays refunds row-by-row and then
		// deducts a total. Without a shared rule for "what one refund is worth" the
		// rows and the deduction were computed differently and could disagree on
		// screen. One exported function is the smallest fix; see net-payment.test.ts.
		'refundValue',
		// Added 2026-10-12 (#66, #84): cash rounding, previewed by the tender pane and applied by
		// the cash.rounding hook with the same function.
		'roundToIncrement',
		'roundedDue',
		'saleProvenanceMeta',
		'serverOwnsMoney',
		// Added 2026-08-23 (#1472): the cart's money write must not sit behind a
		// coupon-reference fetch, and settleCart's missing-coupon gate makes it. The
		// aggregate over the persisted lines needs no coupon data, so it gets its own
		// entry point rather than a flag that changes what settleCart returns.
		'settleAggregate',
		'settleCart',
		'settlementPatch',
		'settlesAtRoundedDue',
		'snapshotFromOrderJSON',
		'splitPlanMeta',
		'toMinor',
		'upsertPaymentRow',
		'withAwaitingCustomer',
		'withLedger',
		'withMetaReplaced',
		'withSaleProvenance',
	]);
});

test('settlementPatch returns the settlement money patch', () => {
	const result = { patch: { total: '10.00' } } as api.SettleAggregateResult;
	expect(api.settlementPatch(result)).toBe(result.patch);
});
