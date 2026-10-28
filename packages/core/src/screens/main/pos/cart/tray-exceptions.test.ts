import { type PaymentRow, withLedger } from '@wcpos/order-math';

import { trayExceptions } from './tray-exceptions';

import type { OrderSaveState } from '../checkout/checkout-mode';
import type { OpenOrderHit } from '../contexts/current-order';

const orders = Array.from({ length: 30 }, (_, i) => ({
	id: `c${i}`,
	record: { uuid: `c${i}`, payload: { meta_data: [] } },
})) as unknown as OpenOrderHit[];
const rejected: OrderSaveState = {
	kind: 'rejected',
	status: null,
	reason: null,
	message: null,
	refused: null,
	parked: false,
};
it('includes a refused save beyond the mounted reach, except on the open cart', () => {
	const saveStates = new Map([['c29', rejected]]);
	expect(trayExceptions({ orders, activeValue: 'c0', saveStates, awaiting: null })).toEqual(
		new Set(['error'])
	);
	expect(trayExceptions({ orders, activeValue: 'c29', saveStates, awaiting: null })).toEqual(
		new Set()
	);
});
it('includes awaiting journals beyond reach, treats unread as empty, and excludes the open cart', () => {
	const input = { orders, activeValue: 'c0', saveStates: new Map() };
	expect(trayExceptions({ ...input, awaiting: new Set(['c29']) })).toEqual(new Set(['warning']));
	expect(trayExceptions({ ...input, awaiting: null })).toEqual(new Set());
	expect(trayExceptions({ ...input, activeValue: 'c29', awaiting: new Set(['c29']) })).toEqual(
		new Set()
	);
});
it.each([
	['server', 'pending', true],
	['server', 'authorized', true],
	['server', 'captured', false],
	['server', 'failed', false],
	['client', 'pending', false],
] as const)('only marks in-motion server legs: %s / %s', (capture_mode, status, warning) => {
	const terminal = {
		id: 'terminal',
		record: {
			uuid: 'terminal',
			payload: {
				meta_data: withLedger(
					[],
					[{ id: 'leg', capture_mode, status, amount: '10.00', tendered: null } as PaymentRow]
				),
			},
		},
	} as OpenOrderHit;
	expect(
		trayExceptions({ orders: [terminal], activeValue: 'c0', saveStates: new Map(), awaiting: null })
	).toEqual(new Set(warning ? ['warning'] : []));
});
it('deduplicates tones and gives a refused save precedence over awaiting on the same cart', () => {
	expect(
		trayExceptions({
			orders,
			activeValue: 'c0',
			saveStates: new Map([['c29', rejected]]),
			awaiting: new Set(['c29']),
		})
	).toEqual(new Set(['error']));
	expect(
		trayExceptions({
			orders,
			activeValue: 'c0',
			saveStates: new Map([['c29', rejected]]),
			awaiting: new Set(['c28', 'c27']),
		})
	).toEqual(new Set(['warning', 'error']));
});
