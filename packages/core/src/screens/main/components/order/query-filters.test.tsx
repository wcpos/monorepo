/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { Cashier } from './cashier';
import { Customer } from './customer';
import { Status } from './status';

const mockSetFilter = jest.fn();

jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
		<button data-testid="filter-cell" onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress }: { onPress: () => void }) => (
		<button data-testid="filter-cell" onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/format', () => ({ FormatAddress: () => null }));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../hooks/use-cashier-label', () => ({
	useCashierLabel: () => ({ id: 7, label: 'Grace' }),
}));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Ada' }),
}));
jest.mock('../../hooks/use-order-status-label', () => ({
	useOrderStatusLabel: () => ({ getLabel: (status: string) => status }),
}));

function context(document: Record<string, unknown>, columnMeta: Record<string, unknown> = {}) {
	return {
		table: { options: { meta: { actions: { setFilter: mockSetFilter } } } },
		row: { original: { document } },
		column: { columnDef: { meta: columnMeta } },
	} as unknown as React.ComponentProps<typeof Cashier>;
}

describe('order table-cell query filters', () => {
	beforeEach(() => jest.clearAllMocks());

	it('filters by the normalized cashier id through the narrow table-meta action', () => {
		render(
			<Cashier
				{...context({
					meta_data$: new BehaviorSubject([{ key: '_pos_user', value: ' 0007 ' }]),
				})}
			/>
		);
		fireEvent.click(screen.getByTestId('filter-cell'));
		expect(mockSetFilter).toHaveBeenCalledWith('cashier', 7);
	});

	it('filters by customer_id through the narrow table-meta action', () => {
		render(
			<Customer
				{...(context({
					customer_id$: new BehaviorSubject(42),
					billing$: new BehaviorSubject({}),
					shipping$: new BehaviorSubject({}),
				}) as unknown as React.ComponentProps<typeof Customer>)}
			/>
		);
		fireEvent.click(screen.getByTestId('filter-cell'));
		expect(mockSetFilter).toHaveBeenCalledWith('customer_id', 42);
	});

	it('filters by status through the narrow table-meta action', () => {
		render(
			<Status
				{...(context({
					status$: new BehaviorSubject('processing'),
				}) as unknown as React.ComponentProps<typeof Status>)}
			/>
		);
		fireEvent.click(screen.getByTestId('filter-cell'));
		expect(mockSetFilter).toHaveBeenCalledWith('status', 'processing');
	});
});
