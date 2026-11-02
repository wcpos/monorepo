/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Cashier } from './cashier';
import { Customer } from './customer';

const mockSetFilter = jest.fn();

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));

jest.mock('@wcpos/components/chip', () => ({
	Chip: ({ label, onPress }: { label: string; onPress?: () => void }) => (
		<button data-testid="filter-cell" onClick={onPress}>
			{label}
		</button>
	),
}));
jest.mock('@wcpos/components/format', () => ({ FormatAddress: () => null }));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('../../hooks/use-cashier-label', () => ({
	useCashierLabel: () => ({ id: 7, label: 'Grace' }),
}));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Ada' }),
}));

function context(payload: Record<string, unknown>, columnMeta: Record<string, unknown> = {}) {
	return {
		table: { options: { meta: { actions: { setFilter: mockSetFilter } } } },
		row: { original: { document: payload, record: { payload } } },
		column: { columnDef: { meta: columnMeta } },
	} as unknown as React.ComponentProps<typeof Cashier>;
}

describe('order table-cell query filters', () => {
	beforeEach(() => jest.clearAllMocks());

	it('filters by the normalized cashier id through the narrow table-meta action', () => {
		render(
			<Cashier
				{...context({
					meta_data: [{ key: '_pos_user', value: ' 0007 ' }],
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
					customer_id: 42,
					billing: {},
					shipping: {},
				}) as unknown as React.ComponentProps<typeof Customer>)}
			/>
		);
		fireEvent.click(screen.getByTestId('filter-cell'));
		expect(mockSetFilter).toHaveBeenCalledWith('customer_id', 42);
	});
});
