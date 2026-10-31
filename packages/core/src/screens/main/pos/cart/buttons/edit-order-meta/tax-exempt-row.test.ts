import { taxExemptRowState } from './tax-exempt-row';

import type { OrderPayload } from '../../../commands/cart-config-for-order';
import type { CurrentOrderRecord } from '../../../contexts/current-order';

const record = { uuid: 'order-1' } as CurrentOrderRecord;
const ledger = (status: string) => [
	{
		key: '_wcpos_payments',
		value: { schema: 1, payments: [{ id: 'leg', status, amount: '10', refunded_amount: '0' }] },
	},
];
function readers(overrides: Record<string, unknown> = {}) {
	return {
		serverOwnsMoney: () => false,
		orderSaveState: () => null,
		inCheckout: () => false,
		configForOrder: () => ({ pricesIncludeTax: false }) as never,
		...overrides,
	};
}
const state = (payload: OrderPayload, overrides = {}, storeReachable = true) =>
	taxExemptRowState(
		{ status: 'pos-open', total: '10', ...payload },
		record,
		readers(overrides),
		2,
		storeReachable
	);
const couponed = { coupon_lines: [{ code: 'save10' }] } as OrderPayload;

it('hides the row on a store whose prices include tax', () => {
	expect(state({}, { configForOrder: () => ({ pricesIncludeTax: true }) as never }).hidden).toBe(
		true
	);
	expect(state({}).hidden).toBe(false);
});

it('is enabled on an open order, a couponed one with the store reachable, and an uncouponed one without', () => {
	const enabled = { hidden: false, disabled: false, reason: undefined };
	expect(state({})).toEqual(enabled);
	expect(state(couponed)).toEqual(enabled);
	expect(state({}, {}, false)).toEqual(enabled);
});

it('asks for a reopen on an order that is not open', () => {
	expect(state({ status: 'completed' }, {}, false)).toEqual({
		hidden: false,
		disabled: true,
		reason: 'pos_cart.tax_exempt_reopen',
	});
});

it('asks for the store on a couponed order when the store is unreachable', () => {
	expect(state(couponed, {}, false)).toMatchObject({
		disabled: true,
		reason: 'pos_cart.tax_exempt_offline',
	});
	// A removed coupon (tombstone) is not a coupon.
	expect(state({ coupon_lines: [{ code: null }] } as OrderPayload, {}, false).disabled).toBe(false);
});

it.each([
	['in checkout', {}, { inCheckout: () => true }],
	['a live payment leg', { meta_data: ledger('pending') }, {}],
	['a rejected save', {}, { orderSaveState: () => ({ kind: 'rejected' }) }],
	['in-memory server ownership', {}, { serverOwnsMoney: () => true }],
] as [string, OrderPayload, object][])(
	'asks to finish the payment when %s',
	(_, payload, overrides) => {
		expect(state(payload, overrides)).toMatchObject({
			disabled: true,
			reason: 'pos_cart.tax_exempt_payment',
		});
	}
);

it('stays enabled on a temporary order and under the durable money-owner hint', () => {
	const temporary = { ...record, isNew: true } as CurrentOrderRecord;
	expect(
		taxExemptRowState({ status: 'pos-open', total: '0' }, temporary, readers(), 2, true).disabled
	).toBe(false);
	expect(state({ meta_data: [{ key: '_wcpos_money_owner_hint', value: 'server' }] }).disabled).toBe(
		false
	);
});
