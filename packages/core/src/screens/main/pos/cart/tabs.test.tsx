/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { OpenOrderTabs } from './tabs';
import {
	enterReceipt,
	finishReceipt,
	getCheckoutModeSnapshot,
	resetCheckoutMode,
} from '../checkout/checkout-mode';

const mockSetOrder = jest.fn();
const mockRecord = (uuid: string, date: string) => ({ uuid, payload: { date_created_gmt: date } });
const mockOpen = [{ id: 'open', record: mockRecord('open', '2026-09-07T12:00:00') }];
const mockReceipts = {
	early: mockRecord('early', '2026-09-07T10:00:00'),
	late: mockRecord('late', '2026-09-07T14:00:00'),
};
const mockPending = new Promise(() => {});
let mockSuspended: string | null = null;
let mockSelect: (id: string) => void;
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrderRecord: mockOpen[0].record,
		openOrders: mockOpen,
		setCurrentOrderID: mockSetOrder,
	}),
}));
jest.mock('../../hooks/use-engine-document', () => ({
	useEngineRecord: (_collection: string, uuid: keyof typeof mockReceipts) => {
		if (uuid === mockSuspended) throw mockPending;
		return mockReceipts[uuid];
	},
}));
jest.mock('observable-hooks', () => ({ useObservableSuspense: (record: unknown) => record }));
jest.mock('@wcpos/query', () => ({ useRecordField: jest.fn() }));
jest.mock('./tab-title', () => ({ CartTabTitle: () => null }));
jest.mock('./tab-chip', () => ({ TabChip: () => null }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({ Text: () => null }));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: () => null,
	TooltipTrigger: () => null,
	TooltipContent: () => null,
}));
jest.mock('@wcpos/components/tabs', () => ({
	Tabs: ({
		children,
		value,
		onValueChange,
	}: {
		children: React.ReactNode;
		value: string;
		onValueChange: (value: string) => void;
	}) => {
		mockSelect = onValueChange;
		return (
			<div data-testid="tabs" data-value={value}>
				{children}
			</div>
		);
	},
	ScrollableTabsList: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	TabsTrigger: ({
		children,
		value,
		testID,
	}: {
		children: React.ReactNode;
		value: string;
		testID: string;
	}) => (
		<button data-testid={testID} onClick={() => mockSelect(value)}>
			{children}
		</button>
	),
}));
beforeEach(() => {
	mockSuspended = null;
	resetCheckoutMode();
	jest.clearAllMocks();
});
it('appends receipt-only tabs after open orders, avoids duplicates, and selects each kind', () => {
	enterReceipt('late');
	enterReceipt('open');
	enterReceipt('early');
	render(<OpenOrderTabs />);
	expect(screen.getAllByTestId(/^open-order-tab-/).map((el) => el.dataset.testid)).toEqual([
		'open-order-tab-open',
		'open-order-tab-late',
		'open-order-tab-early',
	]);
	fireEvent.click(screen.getByTestId('open-order-tab-late'));
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe('late');
	expect(screen.getByTestId('tabs').dataset.value).toBe('late');
	expect(mockSetOrder).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('open-order-tab-open'));
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe('open');
	act(() => finishReceipt('open'));
	fireEvent.click(screen.getByTestId('open-order-tab-open'));
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
	expect(mockSetOrder).toHaveBeenCalledWith('open');
	act(() => enterReceipt('early'));
	fireEvent.click(screen.getByTestId('new-order-tab'));
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
	expect(mockSetOrder).toHaveBeenLastCalledWith('');
});

it('keeps other tabs reachable when a receipt suspends or is missing', () => {
	mockSuspended = 'early';
	enterReceipt('early');
	enterReceipt('missing');
	enterReceipt('late');
	render(<OpenOrderTabs />);
	// A suspended receipt keeps its trigger (the list indexes direct children by value) with
	// empty content; a missing one drops itself from the store and so from the strip.
	expect(screen.getByTestId('open-order-tab-early').textContent).toBe('');
	expect(screen.queryByTestId('open-order-tab-missing')).toBeNull();
	expect(screen.getByTestId('open-order-tab-open')).not.toBeNull();
	expect(screen.getByTestId('open-order-tab-late')).not.toBeNull();
	expect(screen.getByTestId('new-order-tab')).not.toBeNull();
});
