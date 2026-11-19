/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import {
	type MetaDataEntry,
	type PaymentRow,
	withAwaitingCustomer,
	withLedger,
} from '@wcpos/order-math';
import type { EngineRecord, QueryHandle } from '@wcpos/query';

import { resetCheckoutMode } from '../../checkout/checkout-mode';
import { CurrentOrderProvider, isOpenOrderTab, type OpenOrderHit, useCurrentOrder } from './index';

jest.mock('expo-router', () => ({ useRouter: () => ({ setParams: jest.fn() }) }));
jest.mock('./use-new-order', () => ({
	useNewOrder: () => ({ newOrder: { uuid: 'new-order', payload: {} } }),
}));
jest.mock('@wcpos/query', () => ({
	OPEN_ORDER_STATUSES: ['pos-open', 'pos-partial', 'pending'],
	useRecordField: <T,>(record: T, select: (value: T) => unknown) =>
		record ? select(record) : undefined,
}));
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial: Record<string, unknown>) => QueryHandle;
};

const stamp = {
	method_id: 'wcpos_email_invoice',
	destination: 'buyer@example.com',
	attempt_id: 'attempt-1',
	sent_at_gmt: '2026-11-19T10:00:00.000Z',
	cashier_id: 7,
};
const stamped = (): MetaDataEntry[] => withAwaitingCustomer([], stamp);
const captured = { id: 'cash-1', status: 'captured', amount: '5.00' } as PaymentRow;

describe('isOpenOrderTab', () => {
	it('a stamped pending order (a sent invoice) is no tab', () => {
		expect(isOpenOrderTab({ status: 'pending', meta_data: stamped() })).toBe(false);
	});
	it('a part-paid pending order keeps its tab: the counting row clears the stamp', () => {
		expect(isOpenOrderTab({ status: 'pending', meta_data: withLedger([], [captured]) })).toBe(true);
		// A stamp copy that has not caught up with the counting row yet is not active either.
		expect(
			isOpenOrderTab({ status: 'pending', meta_data: withLedger(stamped(), [captured]) })
		).toBe(true);
	});
	it.each(['pos-open', 'pos-partial'])('an unstamped %s order is a tab', (status) => {
		expect(isOpenOrderTab({ status, meta_data: [] })).toBe(true);
		expect(isOpenOrderTab({ status })).toBe(true);
	});
	it('S3: a pending order the store settled, with no stamp, stays a tab as before', () => {
		expect(isOpenOrderTab({ status: 'pending', meta_data: [] })).toBe(true);
	});
	it('a status outside the open list is no tab', () => {
		expect(isOpenOrderTab({ status: 'completed', meta_data: [] })).toBe(false);
	});
});

describe('CurrentOrderProvider open orders', () => {
	const hit = (id: string, status: string, meta_data: MetaDataEntry[]): OpenOrderHit => ({
		id,
		record: { uuid: id, payload: { status, meta_data } } as unknown as EngineRecord<'orders'>,
	});
	function Probe() {
		const { currentOrderRecord, openOrders } = useCurrentOrder();
		return (
			<>
				<span data-testid="tabs">{openOrders.map(({ id }) => id).join(',')}</span>
				<span data-testid="current">{currentOrderRecord.uuid}</span>
			</>
		);
	}
	beforeEach(() => resetCheckoutMode());
	it('leaves a sent invoice out of the tabs, and keeps it current while the cashier is on it', () => {
		const hits = [
			hit('open', 'pos-open', []),
			hit('partial', 'pos-partial', []),
			hit('sent', 'pending', stamped()),
			hit('part-paid', 'pending', withLedger([], [captured])),
			hit('settled', 'pending', []),
		];
		render(
			<CurrentOrderProvider
				handle={fakeQueryHandle({ ready: true, result: { hits } })}
				scope="7:2:r1"
				defaultCustomerResource={{} as never}
				currentOrderUUID="sent"
			>
				<Probe />
			</CurrentOrderProvider>
		);
		expect(screen.getByTestId('tabs').textContent).toBe('open,partial,part-paid,settled');
		expect(screen.getByTestId('current').textContent).toBe('sent');
	});
});
