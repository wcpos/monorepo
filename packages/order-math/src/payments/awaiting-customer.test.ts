import {
	activeAwaitingCustomer,
	readAwaitingCustomer,
	withAwaitingCustomer,
} from './awaiting-customer';
import { GATEWAY_ATTEMPTS_META_KEY, readGatewayAttempts } from './gateway-attempts';
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
const map = (attempts: Record<string, unknown>) => [
	{ key: GATEWAY_ATTEMPTS_META_KEY, value: JSON.stringify({ schema: 1, attempts }) },
];

describe('readAwaitingCustomer', () => {
	it("is the plugin's Attempt_Log::awaiting(): the newest attempt carrying `awaiting`", () => {
		const meta = map({
			'attempt-0': {
				fate: 'sent',
				method_id: 'g',
				cashier_id: 3,
				sent_at_gmt: '2026-10-08T09:00:00Z',
				awaiting: { destination: 'old@b.c', at_gmt: '2026-10-08T09:00:00Z' },
			},
			'attempt-1': {
				fate: 'sent',
				method_id: 'wcpos_email_invoice',
				cashier_id: 7,
				sent_at_gmt: '2026-10-08T09:59:00Z',
				awaiting: { destination: 'buyer@example.com', at_gmt: '2026-10-08T10:00:00.000Z' },
			},
			'attempt-2': { fate: 'sent', method_id: 'g', cashier_id: 7, awaiting: null },
		});
		expect(readAwaitingCustomer(meta)).toEqual(stamp);
		expect(
			readAwaitingCustomer(map({ a: { fate: 'sent', awaiting: { destination: null } } }))
		).toEqual({
			method_id: '',
			destination: null,
			attempt_id: 'a',
			sent_at_gmt: '',
			cashier_id: 0,
		});
		expect(readAwaitingCustomer(map({ a: { fate: 'sent', awaiting: null } }))).toBeNull();
		expect(
			readAwaitingCustomer([{ key: GATEWAY_ATTEMPTS_META_KEY, value: 'not json' }])
		).toBeNull();
		expect(readAwaitingCustomer([])).toBeNull();
	});
});

describe('activeAwaitingCustomer', () => {
	it.each(['pending', 'authorized', 'captured'] as const)(
		'hides the stamp beside a %s row',
		(status) => {
			const meta = withLedger(withAwaitingCustomer([], stamp), [row(status)]);
			expect(activeAwaitingCustomer(meta)).toBeNull();
		}
	);
	it.each(['failed', 'voided'] as const)('keeps the stamp beside a %s row', (status) => {
		const meta = withLedger(withAwaitingCustomer([], stamp), [row(status)]);
		expect(activeAwaitingCustomer(meta)).toEqual(stamp);
	});
});

describe('withAwaitingCustomer', () => {
	it('writes the stamp onto its attempt, reads back the same, and moves it off any other', () => {
		const meta = withAwaitingCustomer([{ key: 'other', value: 1 }], stamp);
		expect(meta[0]).toEqual({ key: 'other', value: 1 });
		expect(readAwaitingCustomer(meta)).toEqual(stamp);
		const moved = withAwaitingCustomer(meta, { ...stamp, attempt_id: 'attempt-2' });
		expect(readAwaitingCustomer(moved)).toEqual({ ...stamp, attempt_id: 'attempt-2' });
		// The earlier attempt is still sent, no longer awaited (S2b marks it superseded).
		expect(readGatewayAttempts(moved).unanswered?.id).toBe('attempt-1');
	});
	it('matches the stamp attempt case-insensitively, as the store keys it', () => {
		const meta = map({ 'attempt-1': { fate: 'sent', method_id: 'm', awaiting: null } });
		const value = JSON.parse(
			withAwaitingCustomer(meta, { ...stamp, attempt_id: 'ATTEMPT-1' })[0].value as string
		);
		expect(Object.keys(value.attempts)).toEqual(['attempt-1']);
		expect(value.attempts['attempt-1'].fate).toBe('sent');
	});
	it('keeps an entry the store already holds, adding only `awaiting`', () => {
		const meta = map({
			'attempt-1': { fate: 'sent', method_id: 'm', sent_at_gmt: 'store', awaiting: null },
		});
		const value = JSON.parse(withAwaitingCustomer(meta, stamp)[0].value as string);
		expect(value.attempts['attempt-1']).toEqual({
			fate: 'sent',
			method_id: 'm',
			sent_at_gmt: 'store',
			awaiting: { destination: 'buyer@example.com', at_gmt: '2026-10-08T10:00:00.000Z' },
		});
	});
	it('null clears every `awaiting` and leaves the rest', () => {
		const meta = withAwaitingCustomer(
			withAwaitingCustomer([{ key: 'other', value: 1 }], stamp),
			null
		);
		expect(meta[0]).toEqual({ key: 'other', value: 1 });
		expect(readAwaitingCustomer(meta)).toBeNull();
		expect(withAwaitingCustomer([{ key: 'other', value: 1 }], null)).toEqual([
			{ key: 'other', value: 1 },
		]);
	});
});
