import { storeSettledTender } from './store-settled';

// #3755: a Web Checkout order the customer paid on the store's pay page (Cash on delivery).
const paidOnStore = {
	total: '45.00',
	status: 'processing',
	date_paid_gmt: '2026-11-23T03:30:00',
	payment_method: 'cod',
	payment_method_title: 'Cash on delivery',
};

describe('storeSettledTender', () => {
	// Revert: make storeSettledTender return null always.
	it('is the order total and the gateway title for a paid order with no till record', () => {
		expect(storeSettledTender(paidOnStore, 0, 2)).toEqual({
			amountMinor: 4500,
			title: 'Cash on delivery',
		});
	});

	// Revert: drop the rowCount check.
	it('is null when the order has any till record, captured or not (records win)', () => {
		expect(storeSettledTender(paidOnStore, 1, 2)).toBeNull();
	});

	// Revert: drop the paid-status check.
	it('is null for an unpaid status, with or without a paid date', () => {
		const pending = { ...paidOnStore, status: 'pending', date_paid_gmt: null };
		expect(storeSettledTender(pending, 0, 2)).toBeNull();
		expect(storeSettledTender({ ...paidOnStore, status: 'cancelled' }, 0, 2)).toBeNull();
		// on-hold is still awaiting the money: only a paid status qualifies, never a paid date alone.
		expect(storeSettledTender({ ...paidOnStore, status: 'on-hold' }, 0, 2)).toBeNull();
	});

	// Revert: drop the total check.
	it('is null for a zero total', () => {
		expect(storeSettledTender({ ...paidOnStore, total: '0.00' }, 0, 2)).toBeNull();
	});
});
