/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, renderHook } from '@testing-library/react';

import { queueHeadlessPrint, resetCheckoutMode, useHeadlessPrints } from '../checkout-mode';
import { HeadlessAutoPrintHost } from './headless-auto-print';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
// A uuid in this set has no record: the sale is gone.
const mockGone = new Set<string>();
jest.mock('@wcpos/query/record-readers', () => ({
	useEngineRecord: (_collection: string, uuid: string) => (mockGone.has(uuid) ? null : { uuid }),
}));
jest.mock('observable-hooks', () => ({ useObservableSuspense: <T,>(value: T) => value }));
// The document hook's own suite proves its print; here it stands in as one auto-print per mount
// that settles when the test says so.
let mockSettled = false;
const mockPrint = jest.fn();
const mockUnmount = jest.fn();
const mockOptions: Record<string, unknown>[] = [];
jest.mock('../../../receipt/use-receipt-document', () => ({
	useReceiptDocument: (options: Record<string, unknown>) => {
		mockOptions.push(options);
		const uuid = (options.order as { uuid: string }).uuid;
		const { useEffect } = jest.requireActual<typeof React>('react');
		useEffect(() => {
			mockPrint(uuid);
			return () => mockUnmount(uuid);
		}, [uuid]);
		return { autoPrintSettled: mockSettled };
	},
}));

beforeEach(() => {
	resetCheckoutMode();
	mockSettled = false;
	mockOptions.length = 0;
	mockGone.clear();
	jest.clearAllMocks();
});

it('prints once and settles', async () => {
	const { rerender } = render(<HeadlessAutoPrintHost />);
	await act(async () => {
		queueHeadlessPrint('a');
		queueHeadlessPrint('a');
	});
	expect(mockPrint.mock.calls).toEqual([['a']]);
	expect(mockOptions.at(-1)).toMatchObject({
		order: { uuid: 'a' },
		autoPrintAllowed: true,
		headless: true,
	});
	mockSettled = true;
	await act(async () => rerender(<HeadlessAutoPrintHost />));
	expect(mockUnmount.mock.calls).toEqual([['a']]);
	// Settled is done for the session: queueing the sale again prints nothing.
	await act(async () => queueHeadlessPrint('a'));
	expect(mockPrint).toHaveBeenCalledTimes(1);
});

it('stays mounted until the print settles', async () => {
	const { rerender } = render(<HeadlessAutoPrintHost />);
	await act(async () => {
		queueHeadlessPrint('a');
		queueHeadlessPrint('b');
	});
	await act(async () => rerender(<HeadlessAutoPrintHost />));
	expect(mockUnmount).not.toHaveBeenCalled();
	mockSettled = true;
	await act(async () => rerender(<HeadlessAutoPrintHost />));
	expect(mockUnmount.mock.calls).toEqual([['a'], ['b']]);
});

it('a failed print offers Reprint', async () => {
	render(<HeadlessAutoPrintHost />);
	await act(async () => queueHeadlessPrint('a'));
	const action = mockOptions.at(-1)?.failureToastAction as { label: string; onClick: () => void };
	expect(action.label).toBe('receipt.reprint');
	action.onClick();
	// The routed receipt never auto-prints, so the cashier's Print is the only print there.
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
		params: { orderId: 'a' },
	});
});

it('a queued sale whose record is gone leaves the queue and never prints', async () => {
	mockGone.add('gone');
	render(<HeadlessAutoPrintHost />);
	const queue = renderHook(() => useHeadlessPrints());
	await act(async () => queueHeadlessPrint('gone'));
	expect(queue.result.current.has('gone')).toBe(false);
	expect(mockOptions).toEqual([]);
	expect(mockPrint).not.toHaveBeenCalled();
});
