/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { type PaymentRow, withLedger } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { resumableTerminalRow, useResumeTerminalLegsForOrders } from './use-resume-terminal-legs';
import { row } from '../device/fixtures.test-utils';
jest.mock('@wcpos/query', () => ({ useRecordField: jest.fn() }));
it.each([
	['server', 'pending', false, true],
	['server', 'authorized', false, true],
	['device', 'authorized', false, true],
	['device', 'pending', false, true],
	['device', 'authorized', true, false],
	['device', 'captured', false, false],
	['device', 'failed', false, false],
	['manual', 'pending', false, false],
] as const)('resume rule %s %s offline=%s', (capture_mode, status, recorded_offline, expected) => {
	expect(resumableTerminalRow({ ...row, capture_mode, status, recorded_offline })).toBe(expected);
});

const mockService = {
	trackOffline: jest.fn(),
	flushOffline: jest.fn(),
	resume: jest.fn(),
	get: jest.fn(),
};
jest.mock('../../../../../../services/terminal-payments', () => ({
	getTerminalPaymentsService: () => mockService,
	getTerminalPaymentsServiceStartVersion: () => 1,
	subscribeTerminalPaymentsServiceStart: () => () => {},
}));
it.each([
	['pending', false],
	['authorized', false],
	['pending', true],
	['authorized', true],
] as const)(
	'without a server id only offline authorization is tracked: %s offline=%s',
	(status, recorded_offline) => {
		jest.clearAllMocks();
		const payment: PaymentRow = { ...row, status, recorded_offline };
		const order = {
			uuid: 'order',
			payload: { meta_data: withLedger([], [payment]) },
		} as EngineRecord<'orders'>;
		const rendered = renderHook(({ orders }) => useResumeTerminalLegsForOrders(orders), {
			initialProps: { orders: [order] },
		});
		expect(mockService.resume).not.toHaveBeenCalled();
		expect(mockService.trackOffline).toHaveBeenCalledTimes(
			status === 'authorized' && recorded_offline ? 1 : 0
		);
		rendered.rerender({ orders: [{ ...order, payload: { ...order.payload, id: 42 } }] });
		if (!recorded_offline)
			expect(mockService.resume).toHaveBeenCalledWith(
				expect.objectContaining({ orderId: 42, row: payment })
			);
	}
);
