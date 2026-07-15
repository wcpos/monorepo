/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { Orders } from './index';
import { QueryStateProvider, useQueryState } from '../../../../query';

import type { FiltersOf } from '../../../../query';

const mockBinding = {
	resource: { kind: 'reports-orders-resource' },
	active$: of(false),
	total$: of(24),
	totalSource$: of('coverage' as const),
	sync: jest.fn(async () => undefined),
};
let mockDataTableProps: Record<string, unknown> = {};
let mockFooterProps: Record<string, unknown> = {};

jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../components/data-table', () => ({
	DataTable: (props: Record<string, unknown>) => {
		mockDataTableProps = props;
		const renderCell = props.renderCell as (
			columnKey: string,
			info: Record<string, unknown>
		) => React.ReactNode;
		return (
			<div data-testid="reports-orders-table">
				{renderCell('customer_id', {})}
				{renderCell('cashier', {})}
				{renderCell('status', {})}
			</div>
		);
	},
	DataTableHeader: () => null,
	DataTableFooter: (props: Record<string, unknown>) => {
		mockFooterProps = props;
		return null;
	},
}));
jest.mock('../../components/data-table/skeleton', () => ({ DataTableSkeleton: () => null }));
jest.mock('../../components/date', () => ({ DateCell: () => null }));
jest.mock('../../components/order/created-via', () => ({ CreatedVia: () => null }));
jest.mock('../../components/order/order-number', () => ({ OrderNumber: () => null }));
jest.mock('../../components/order/payment-method', () => ({ PaymentMethod: () => null }));
jest.mock('../../components/order/total', () => ({ Total: () => null }));
jest.mock('../../components/order/customer', () => ({
	Customer: () => <div data-testid="shared-customer-cell" />,
}));
jest.mock('../../components/order/cashier', () => ({
	Cashier: () => <div data-testid="shared-cashier-cell" />,
}));
jest.mock('../../components/order/status', () => ({
	Status: () => <div data-testid="shared-status-cell" />,
}));
jest.mock('../../components/ui-settings', () => ({
	UISettingsDialog: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../components/text-cell', () => ({ TextCell: () => null }));
jest.mock('./header-select', () => ({ TableHeaderSelect: () => null }));
jest.mock('./row-select', () => ({ TableRowSelect: () => null }));
jest.mock('../context', () => ({
	useReports: () => ({
		binding: mockBinding,
		allOrders: [],
		unselectedRowIds: {},
		setUnselectedRowIds: jest.fn(),
	}),
}));
jest.mock('../ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

function FilterProbe() {
	const filters = useQueryState<'orders', FiltersOf<'orders'>>((state) => state.filters);
	return <div data-testid="filters">{JSON.stringify(filters)}</div>;
}

describe('reports orders binding table', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockDataTableProps = {};
		mockFooterProps = {};
	});

	it('uses binding mode and the shared binding cells', () => {
		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<Orders />
				<FilterProbe />
			</QueryStateProvider>
		);

		expect(screen.getByTestId('shared-customer-cell')).toBeTruthy();
		expect(screen.getByTestId('shared-cashier-cell')).toBeTruthy();
		expect(screen.getByTestId('shared-status-cell')).toBeTruthy();
		expect(mockDataTableProps).toMatchObject({
			resource: mockBinding.resource,
			sort: { field: 'date_created_gmt', direction: 'desc' },
			active$: mockBinding.active$,
			total$: mockBinding.total$,
			totalSource$: mockBinding.totalSource$,
			sync: mockBinding.sync,
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
		const Footer = mockDataTableProps.TableFooterComponent as React.ComponentType<
			Record<string, unknown>
		>;
		render(
			<Footer
				active$={mockBinding.active$}
				total$={mockBinding.total$}
				totalSource$={mockBinding.totalSource$}
				sync={mockBinding.sync}
				count={0}
			/>
		);
		expect(mockFooterProps.collectionName).toBe('orders');

		const actions = mockDataTableProps.actions as {
			setFilter: (field: 'status', value: string) => void;
		};
		act(() => actions.setFilter('status', 'processing'));
		expect(screen.getByTestId('filters').textContent).toContain('"status":"processing"');
	});
});
