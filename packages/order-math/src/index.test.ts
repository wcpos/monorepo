import * as api from './index';

test('public value surface is exactly the spec', () => {
	expect(
		Object.keys(api)
			.filter((k) => typeof (api as Record<string, unknown>)[k] === 'function')
			.sort()
	).toEqual([
		'activeAwaitingCustomer',
		'calculateCartLine',
		'countsTowardPaid',
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
		'isFailedPaymentStatus',
		'isFinalPaymentStatus',
		'isFixedFeeLine',
		// Added 2026-10-23 (C6, ADR 0033 item 8): the row-state vocabulary — money in motion, the
		// offline device authorization, and §3.4 rule 2's voidable partition — one home for the
		// copies in core and query.
		'isInMotionPaymentStatus',
		'isLivePaymentStatus',
		'isOfflineDeviceAuthorization',
		'isSettledPaymentRow',
		'mintDevicePayment',
		'mintManualPayment',
		'mintServerPayment',
		'parsePaymentsContract',
		'partitionVoidableRows',
		'readAwaitingCustomer',
		'readCompletions',
		// Added 2026-10-23 (#2900 S2a): the order's gateway attempts, read and patched in one place;
		// the awaiting stamp is derived from them, as the plugin's Attempt_Log::awaiting() does.
		'readGatewayAttempts',
		'readLedger',
		// Added 2026-08-19: the POS cart footer displays refunds row-by-row and then
		// deducts a total. Without a shared rule for "what one refund is worth" the
		// rows and the deduction were computed differently and could disagree on
		// screen. One exported function is the smallest fix; see net-payment.test.ts.
		'refundValue',
		// #3093: retaxing encodes line ownership: settlement owns percent fees and shipping.
		'retaxCartLines',
		// #3092: re-tax stored money without rebuilding a discounted line's price basis.
		'retaxLine',
		// Added 2026-10-12 (#66, #84): cash rounding, previewed by the tender pane and applied by
		// the cash.rounding hook with the same function.
		'roundToIncrement',
		'roundedDue',
		'saleProvenanceMeta',
		// Added 2026-10-21 (#2830): one payment-row identity for the ledger upsert and query's answer merge.
		'samePaymentId',
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
		// Added 2026-10-24 (#2900 S2b): a submit's answer on the attempt map, as the store applies it.
		'withAttemptAnswer',
		'withAwaitingCustomer',
		'withGatewayAttempt',
		'withLedger',
		'withMetaReplaced',
		'withSaleProvenance',
	]);
});

test('settlementPatch returns the settlement money patch', () => {
	const result = { patch: { total: '10.00' } } as api.SettleAggregateResult;
	expect(api.settlementPatch(result)).toBe(result.patch);
});

test('the offline device authorization literal is part of the surface', () => {
	expect(api.OFFLINE_DEVICE_AUTHORIZATION).toEqual({
		capture_mode: 'device',
		recorded_offline: true,
		status: 'authorized',
	});
});
