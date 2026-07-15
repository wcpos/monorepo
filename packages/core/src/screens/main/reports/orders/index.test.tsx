/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { Orders } from './index';

const mockQuery = {
	where: jest.fn(),
	equals: jest.fn(),
	multipleElemMatch: jest.fn(),
	exec: jest.fn(),
};

mockQuery.where.mockReturnValue(mockQuery);
mockQuery.equals.mockReturnValue(mockQuery);
mockQuery.multipleElemMatch.mockReturnValue(mockQuery);

const mockOrder = {
	customer_id$: new BehaviorSubject(42),
	billing$: new BehaviorSubject({}),
	shipping$: new BehaviorSubject({}),
	meta_data$: new BehaviorSubject([{ key: '_pos_user', value: '7' }]),
	status$: new BehaviorSubject('processing'),
};

jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
		<button data-testid="legacy-filter-cell" onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress }: { onPress?: () => void }) => (
		<button data-testid="legacy-status-filter-cell" onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/format', () => ({ FormatAddress: () => null }));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
jest.mock('../../components/data-table', () => ({
	DataTable: ({
		query,
		renderCell,
	}: {
		query: unknown;
		renderCell: (columnKey: string, info: Record<string, unknown>) => React.ReactNode;
	}) => {
		const context = {
			table: { options: { meta: { query } } },
			row: { original: { document: mockOrder } },
			column: { columnDef: { meta: {} } },
		};

		return (
			<div data-testid="reports-orders-table">
				{renderCell('customer_id', context)}
				{renderCell('cashier', context)}
				{renderCell('status', context)}
			</div>
		);
	},
	DataTableHeader: () => null,
}));
jest.mock('../../components/data-table/skeleton', () => ({ DataTableSkeleton: () => null }));
jest.mock('../../components/date', () => ({ DateCell: () => null }));
jest.mock('../../components/order/created-via', () => ({ CreatedVia: () => null }));
jest.mock('../../components/order/order-number', () => ({ OrderNumber: () => null }));
jest.mock('../../components/order/payment-method', () => ({ PaymentMethod: () => null }));
jest.mock('../../components/order/total', () => ({ Total: () => null }));
jest.mock('../../components/ui-settings', () => ({
	UISettingsDialog: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../components/text-cell', () => ({ TextCell: () => null }));
jest.mock('./header-select', () => ({ TableHeaderSelect: () => null }));
jest.mock('./row-select', () => ({ TableRowSelect: () => null }));
jest.mock('../context', () => ({
	useReports: () => ({
		query: mockQuery,
		allOrders: [],
		unselectedRowIds: {},
		setUnselectedRowIds: jest.fn(),
	}),
}));
jest.mock('../ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

describe('reports orders legacy cell filters', () => {
	beforeEach(() => jest.clearAllMocks());

	it('renders report-local cells that still apply filters through the legacy query', () => {
		render(<Orders />);

		const filterCells = screen.getAllByTestId('legacy-filter-cell');
		fireEvent.click(filterCells[0]!);
		fireEvent.click(filterCells[1]!);
		fireEvent.click(screen.getByTestId('legacy-status-filter-cell'));

		expect(mockQuery.where.mock.calls).toEqual([['customer_id'], ['meta_data'], ['status']]);
		expect(mockQuery.equals.mock.calls).toEqual([[42], ['processing']]);
		expect(mockQuery.multipleElemMatch).toHaveBeenCalledWith({
			key: '_pos_user',
			value: '7',
		});
		expect(mockQuery.exec).toHaveBeenCalledTimes(3);
	});
});
