import { CustomerDisplayBroadcast } from './broadcast';
import { createIdleCustomerDisplayState } from './create-snapshot';

import type { CustomerDisplaySnapshotV1, CustomerDisplayStateV1 } from './types';

function cartState(total = '5'): CustomerDisplayStateV1 {
	return {
		...createIdleCustomerDisplayState(),
		status: 'cart',
		currency: { code: 'USD', symbol: '$', decimalPlaces: 2, pricesIncludeTax: false },
		totals: { ...createIdleCustomerDisplayState().totals, total },
	};
}

describe('CustomerDisplayBroadcast', () => {
	it('replays the latest full snapshot to late subscribers', () => {
		const broadcast = new CustomerDisplayBroadcast();
		broadcast.publish(cartState());
		const received: CustomerDisplaySnapshotV1[] = [];
		const subscription = broadcast.snapshots$.subscribe((snapshot) => received.push(snapshot));

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual({
			protocol: 'wcpos.customer-display',
			version: 1,
			sequence: 2,
			status: 'cart',
			currency: { code: 'USD', symbol: '$', decimalPlaces: 2, pricesIncludeTax: false },
			items: [],
			fees: [],
			shipping: [],
			totals: {
				subtotal: '0',
				subtotalTax: '0',
				discount: '0',
				discountTax: '0',
				fee: '0',
				feeTax: '0',
				shipping: '0',
				shippingTax: '0',
				tax: '0',
				total: '5',
			},
		});
		subscription.unsubscribe();
	});

	it('starts with a replayable idle snapshot', () => {
		const broadcast = new CustomerDisplayBroadcast();
		const received: CustomerDisplaySnapshotV1[] = [];
		const subscription = broadcast.snapshots$.subscribe((snapshot) => received.push(snapshot));

		expect(received).toEqual([expect.objectContaining({ status: 'idle', sequence: 1, items: [] })]);
		subscription.unsubscribe();
	});

	it('deduplicates visible state and increments only for changes', () => {
		const broadcast = new CustomerDisplayBroadcast();
		const received: CustomerDisplaySnapshotV1[] = [];
		const subscription = broadcast.snapshots$.subscribe((snapshot) => received.push(snapshot));

		expect(broadcast.publish(cartState('5'))?.sequence).toBe(2);
		expect(broadcast.publish(cartState('5'))).toBeUndefined();
		expect(broadcast.publish(cartState('6'))?.sequence).toBe(3);
		expect(received.map((snapshot) => snapshot.sequence)).toEqual([1, 2, 3]);
		subscription.unsubscribe();
	});

	it('replaces replayed cart data with idle state on clear', () => {
		const broadcast = new CustomerDisplayBroadcast();
		broadcast.publish(cartState());
		expect(broadcast.clear()?.sequence).toBe(3);

		let latest: CustomerDisplaySnapshotV1 | undefined;
		const subscription = broadcast.snapshots$.subscribe((snapshot) => {
			latest = snapshot;
		});
		expect(latest).toMatchObject({ status: 'idle', sequence: 3, items: [] });
		subscription.unsubscribe();
	});

	it('prevents subscribers from mutating a replayed snapshot', () => {
		const broadcast = new CustomerDisplayBroadcast();
		const snapshot = broadcast.publish(cartState())!;

		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.currency)).toBe(true);
		expect(Object.isFrozen(snapshot.totals)).toBe(true);
		expect(() => {
			snapshot.totals.total = '999';
		}).toThrow();
	});

	it('does not let a released publisher clear a newer publisher state', async () => {
		const broadcast = new CustomerDisplayBroadcast();
		const oldOwner = Symbol('old');
		const newOwner = Symbol('new');
		broadcast.publish(cartState('5'), oldOwner);
		broadcast.clear(oldOwner);
		broadcast.publish(cartState('6'), newOwner);
		await Promise.resolve();

		let latest: CustomerDisplaySnapshotV1 | undefined;
		const subscription = broadcast.snapshots$.subscribe((snapshot) => {
			latest = snapshot;
		});
		expect(latest).toMatchObject({ status: 'cart', totals: { total: '6' } });
		subscription.unsubscribe();
	});
});
