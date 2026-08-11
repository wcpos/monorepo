import * as React from 'react';
import { act } from 'react';

import { create } from 'react-test-renderer';
import { BehaviorSubject } from 'rxjs';

import { CustomerDisplayBroadcast } from './broadcast';
import { CustomerDisplayBroadcaster } from './broadcaster';

import type { CustomerDisplaySnapshotV1 } from './types';

const currency$ = new BehaviorSubject('USD');
let currentOrder: ReturnType<typeof buildOrder>;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
	true;

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
	return { ...value, $: new BehaviorSubject(value) };
}

describe('CustomerDisplayBroadcaster', () => {
	beforeEach(() => {
		currentOrder = buildOrder();
	});

	it('publishes root revisions and selected-order changes, then idles on cleanup', async () => {
		const broadcast = new CustomerDisplayBroadcast();
		const received: CustomerDisplaySnapshotV1[] = [];
		const subscription = broadcast.snapshots$.subscribe((snapshot) => received.push(snapshot));
		let view: ReturnType<typeof create>;
		act(() => {
			view = create(<CustomerDisplayBroadcaster status="cart" broadcast={broadcast} />);
		});

		expect(received.at(-1)).toMatchObject({
			status: 'cart',
			items: [{ name: 'Coffee' }],
			totals: { total: '5' },
		});

		act(() => {
			currentOrder.$.next({
				...currentOrder.$.value,
				line_items: [{ ...currentOrder.$.value.line_items[0], name: 'Coffee revision' }],
			});
		});
		expect(received.at(-1)).toMatchObject({ items: [{ name: 'Coffee revision' }] });

		const previousOrder = currentOrder;
		const nextOrder = buildOrder('Tea', '6');
		currentOrder = nextOrder;
		act(() => {
			view.update(<CustomerDisplayBroadcaster status="cart" broadcast={broadcast} />);
		});
		expect(received.at(-1)).toMatchObject({ items: [{ name: 'Tea' }], totals: { total: '6' } });
		const countAfterSwitch = received.length;
		act(() => {
			previousOrder.$.next({ ...previousOrder.$.value, line_items: [] });
		});
		expect(received).toHaveLength(countAfterSwitch);

		act(() => {
			view.update(<CustomerDisplayBroadcaster status="awaiting-payment" broadcast={broadcast} />);
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
			nextOrder.$.next({ ...nextOrder.$.value, line_items: [] });
		});
		expect(received).toHaveLength(countAfterUnmount);
		subscription.unsubscribe();
	});
});
