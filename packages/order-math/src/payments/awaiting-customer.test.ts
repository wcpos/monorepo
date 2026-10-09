import {
	activeAwaitingCustomer,
	AWAITING_CUSTOMER_META_KEY,
	readAwaitingCustomer,
	withAwaitingCustomer,
} from './awaiting-customer';
import { withLedger } from './ledger';

import type { PaymentRow } from './types';

const stamp = {
	method_id: 'wcpos_email_invoice',
	destination: 'buyer@example.com',
	attempt_id: 'attempt-1',
	sent_at_gmt: '2026-10-08T10:00:00.000Z',
	cashier_id: 7,
};
const row = (status: PaymentRow['status']) => ({ id: status, status }) as PaymentRow;

describe('readAwaitingCustomer', () => {
	it('reads an object or a JSON string, needs method_id and attempt_id, fills the rest', () => {
		expect(readAwaitingCustomer([{ key: AWAITING_CUSTOMER_META_KEY, value: stamp }])).toEqual(
			stamp
		);
		expect(
			readAwaitingCustomer([
				{
					key: AWAITING_CUSTOMER_META_KEY,
					value: JSON.stringify({ method_id: 'g', attempt_id: 'a' }),
				},
			])
		).toEqual({
			method_id: 'g',
			destination: null,
			attempt_id: 'a',
			sent_at_gmt: '',
			cashier_id: 0,
		});
		expect(
			readAwaitingCustomer([{ key: AWAITING_CUSTOMER_META_KEY, value: { method_id: 'g' } }])
		).toBeNull();
		expect(
			readAwaitingCustomer([{ key: AWAITING_CUSTOMER_META_KEY, value: 'not json' }])
		).toBeNull();
		expect(readAwaitingCustomer([])).toBeNull();
	});
});

describe('activeAwaitingCustomer', () => {
	it.each(['pending', 'authorized', 'captured'] as const)(
		'hides the stamp beside a %s row',
		(status) => {
			const meta = withLedger([{ key: AWAITING_CUSTOMER_META_KEY, value: stamp }], [row(status)]);
			expect(activeAwaitingCustomer(meta)).toBeNull();
		}
	);
	it.each(['failed', 'voided'] as const)('keeps the stamp beside a %s row', (status) => {
		const meta = withLedger([{ key: AWAITING_CUSTOMER_META_KEY, value: stamp }], [row(status)]);
		expect(activeAwaitingCustomer(meta)).toEqual(stamp);
	});
});

describe('withAwaitingCustomer', () => {
	it('replaces or removes the one entry and leaves the rest', () => {
		const meta = [
			{ key: 'other', value: 1 },
			{ key: AWAITING_CUSTOMER_META_KEY, value: stamp },
		];
		expect(withAwaitingCustomer(meta, { ...stamp, attempt_id: 'attempt-2' })).toEqual([
			{ key: 'other', value: 1 },
			{ key: AWAITING_CUSTOMER_META_KEY, value: { ...stamp, attempt_id: 'attempt-2' } },
		]);
		expect(withAwaitingCustomer(meta, null)).toEqual([{ key: 'other', value: 1 }]);
	});
});
