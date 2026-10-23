import { judgeGatewaySnapshot } from './gateway-snapshot';

const STORED = { bacs: 'pending', cod: null, cheque: 'on-hold' };

describe('judgeGatewaySnapshot', () => {
	it.each([
		// status, gateway, stored map, settled, storedStatus
		['completed', 'cod', STORED, true, null],
		['processing', 'stripe', STORED, true, null],
		['pending', 'bacs', STORED, true, 'pending'],
		['pending', 'cod', STORED, false, null],
		// A status counts only for its OWN gateway: bacs's `pending` never closes a stripe sale.
		['pending', 'stripe', STORED, false, null],
		['pending', 'bacs', {}, false, null],
		['pos-open', 'bacs', { bacs: 'pos-open' }, false, 'pos-open'],
		['failed', 'bacs', { bacs: 'failed' }, false, 'failed'],
		['cancelled', 'cod', STORED, false, null],
		['refunded', 'cod', STORED, false, null],
		['on-hold', 'cheque', STORED, true, 'on-hold'],
		['pending', undefined, STORED, false, null],
		['pending', 7, { 7: 'pending' }, false, null],
	])('%s via %s → settled %s', (status, gateway, stored, settled, storedStatus) => {
		const snapshot = { id: 42, status, payment_method: gateway };
		const judged = judgeGatewaySnapshot(snapshot, stored as Record<string, string | null>, 2);
		expect(judged).toEqual({
			outcome: { source: 'gateway-snapshot', snapshot, settledOrderStatus: storedStatus },
			storedStatus,
			settled,
		});
		expect(judged.outcome.snapshot).toBe(snapshot);
	});
});
