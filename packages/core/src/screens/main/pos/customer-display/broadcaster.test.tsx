/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { CustomerDisplayBroadcast } from './broadcast';
import { CustomerDisplayBroadcaster } from './broadcaster';
import { calculateOrderTotals } from '../hooks/calculate-order-totals';

import type { CustomerDisplaySnapshotV1 } from './types';

const currency$ = new BehaviorSubject<string | undefined>('USD');
let currentOrder: ReturnType<typeof buildOrder>;

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: { currency$ } }),
}));

jest.mock('../../contexts/tax-rates', () => ({
	useTaxRates: () => ({
		allRates: [],
		taxRoundAtSubtotal: false,
		priceNumDecimals: 2,
		pricesIncludeTax: false,
	}),
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrder }),
}));

jest.mock('../hooks/calculate-order-totals', () => {
	const actual = jest.requireActual<typeof import('../hooks/calculate-order-totals')>(
		'../hooks/calculate-order-totals'
	);
	return { ...actual, calculateOrderTotals: jest.fn(actual.calculateOrderTotals) };
});

function buildOrder(name = 'Coffee', total = '5') {
	const value = {
		currency: 'USD',
		currency_symbol: '$',
		line_items: [
			{
				product_id: 10,
				name,
				quantity: 1,
				price: Number(total),
				subtotal: total,
				subtotal_tax: '0',
				total,
				total_tax: '0',
				taxes: [],
			},
		],
		fee_lines: [],
		shipping_lines: [],
		coupon_lines: [],
	};
	return {
		...value,
		currency$: new BehaviorSubject<string | undefined>(value.currency),
		currency_symbol$: new BehaviorSubject<string | undefined>(value.currency_symbol),
		line_items$: new BehaviorSubject(value.line_items),
		fee_lines$: new BehaviorSubject<
			{ name: string | null; total: string; total_tax: string; taxes: never[] }[]
		>(value.fee_lines),
		shipping_lines$: new BehaviorSubject<
			{
				method_id: string | null;
				method_title: string;
				total: string;
				total_tax: string;
				taxes: never[];
			}[]
		>(value.shipping_lines),
		coupon_lines$: new BehaviorSubject<
			{ code: string | null; discount?: string; discount_tax?: string }[]
		>(value.coupon_lines),
	};
}

describe('CustomerDisplayBroadcaster', () => {
	beforeEach(() => {
		jest.mocked(calculateOrderTotals).mockClear();
		currency$.next('USD');
		currentOrder = buildOrder();
	});

	it('publishes field revisions and selected-order changes, then idles on cleanup', async () => {
		const broadcast = new CustomerDisplayBroadcast();
		const received: CustomerDisplaySnapshotV1[] = [];
		const subscription = broadcast.snapshots$.subscribe((snapshot) => received.push(snapshot));
		const view = render(<CustomerDisplayBroadcaster status="cart" broadcast={broadcast} />);

		expect(received.at(-1)).toMatchObject({
			status: 'cart',
			items: [{ name: 'Coffee' }],
			totals: { total: '5' },
		});

		act(() => {
			currentOrder.line_items$.next([
				{ ...currentOrder.line_items$.value[0], name: 'Coffee revision' },
			]);
		});
		expect(received.at(-1)).toMatchObject({ items: [{ name: 'Coffee revision' }] });

		act(() => {
			currentOrder.coupon_lines$.next([
				{ code: 'safe-internal-code', discount: '1', discount_tax: '0' },
			]);
		});
		expect(calculateOrderTotals).toHaveBeenLastCalledWith(
			expect.objectContaining({
				couponLines: [expect.objectContaining({ code: 'safe-internal-code', discount: '1' })],
			})
		);

		act(() => {
			currentOrder.fee_lines$.next([{ name: 'Service', total: '1', total_tax: '0', taxes: [] }]);
			currentOrder.shipping_lines$.next([
				{
					method_id: 'pickup',
					method_title: 'Pickup',
					total: '2',
					total_tax: '0',
					taxes: [],
				},
			]);
		});
		expect(received.at(-1)).toMatchObject({
			fees: [{ name: 'Service' }],
			shipping: [{ name: 'Pickup' }],
		});

		act(() => {
			currentOrder.currency$.next(undefined);
			currentOrder.currency_symbol$.next('$');
			currency$.next('EUR');
		});
		expect(received.at(-1)).toMatchObject({ currency: { code: 'EUR', symbol: '€' } });

		const previousOrder = currentOrder;
		const nextOrder = buildOrder('Tea', '6');
		currentOrder = nextOrder;
		act(() => {
			view.rerender(<CustomerDisplayBroadcaster status="cart" broadcast={broadcast} />);
		});
		expect(received.at(-1)).toMatchObject({ items: [{ name: 'Tea' }], totals: { total: '6' } });
		const countAfterSwitch = received.length;
		act(() => {
			previousOrder.line_items$.next([]);
		});
		expect(received).toHaveLength(countAfterSwitch);

		act(() => {
			view.rerender(<CustomerDisplayBroadcaster status="awaiting-payment" broadcast={broadcast} />);
		});
		expect(received.at(-1)?.status).toBe('awaiting-payment');

		act(() => {
			view.unmount();
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(received.at(-1)).toMatchObject({ status: 'idle', items: [] });
		const countAfterUnmount = received.length;
		act(() => {
			nextOrder.line_items$.next([]);
		});
		expect(received).toHaveLength(countAfterUnmount);
		subscription.unsubscribe();
	});
});
