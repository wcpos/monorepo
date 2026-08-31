/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { QueryStateProvider } from '../../../../query';
import { DataTable, DataTableFooter } from './index';

const mockSetSort = jest.fn();
const mockExtendLimit = jest.fn();
const mockSetFilter = jest.fn();
const mockPatchUI = jest.fn();
let mockTableMeta: Record<string, unknown> | undefined;
let mockFooterProps: Record<string, unknown> | undefined;
let mockDefaultFooterProps: Record<string, unknown> | undefined;
const mockClearAndRefresh = jest.fn();

// Mutable so a test can change the visible-column set between renders; the
// default matches the original single-column fixture.
let mockColumns: { key: string; show: boolean }[] = [{ key: 'level', show: true }];
// Mutable so a test can render an empty (or search-pending) result.
let mockResult: Record<string, unknown> = {
	hits: [{ id: 'log-1', record: { payload: { level: 'error' } } }],
};

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => mockColumns,
	// The paging guard reads the binding's pending$/exhausted$ through this; the initial
	// value ("not pending", "no opinion") is all these tests need.
	useObservableState: (_source: unknown, initial: unknown) => initial,
	useObservableSuspense: () => mockResult,
}));

jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: {
			columns$: {},
			sortBy: 'timestamp',
			sortDirection: 'desc',
		},
		getUILabel: (key: string) => key,
		patchUI: mockPatchUI,
	}),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('@wcpos/components/table', () => ({
	Table: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TableBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TableCell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TableFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TableHead: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TableHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TableRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	List: ({
		data,
		renderItem,
		onEndReached,
		ListEmptyComponent,
	}: {
		data: unknown[];
		renderItem: (input: { item: unknown; index: number }) => React.ReactNode;
		onEndReached: () => void;
		ListEmptyComponent?: React.ComponentType;
	}) => (
		<div>
			{data.length === 0 && ListEmptyComponent ? <ListEmptyComponent /> : null}
			{data.map((item, index) => (
				<React.Fragment key={index}>{renderItem({ item, index })}</React.Fragment>
			))}
			<button data-testid="end-reached" onClick={onEndReached} />
		</div>
	),
	Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('./header', () => ({
	DataTableHeader: ({
		columnId,
		sortBy,
		sortDirection,
		onSortingChange,
	}: {
		columnId: string;
		sortBy: string;
		sortDirection: 'asc' | 'desc';
		onSortingChange: (sort: { sortBy: string; sortDirection: 'asc' }) => void;
	}) => (
		<button
			data-testid={`sort-${columnId}`}
			data-sort-by={sortBy}
			data-sort-direction={sortDirection}
			onClick={() => onSortingChange({ sortBy: columnId, sortDirection: 'asc' })}
		/>
	),
}));
jest.mock('./footer', () => ({
	DataTableFooter: ({ children, ...props }: Record<string, unknown>) => {
		mockDefaultFooterProps = props;
		return (
			<>
				{children as React.ReactNode}
				<button
					data-testid="clear-and-refresh"
					onClick={() => {
						if (typeof props.collectionName !== 'string') {
							throw new Error('collectionName is required');
						}
						mockClearAndRefresh(props.collectionName);
					}}
				/>
			</>
		);
	},
}));
jest.mock('./list-footer', () => ({ ListFooterComponent: () => null }));
jest.mock('../../components/record-text-cell', () => ({
	RecordTextCell: ({ column }: { column: { id: string } }) => (
		<div data-testid={`record-text-${column.id}`} />
	),
}));

function Footer(props: Record<string, unknown>) {
	mockFooterProps = props;
	return null;
}

function TaxFooter(props: React.ComponentProps<typeof DataTableFooter>) {
	return (
		<DataTableFooter {...props}>
			<span data-testid="tax-based-on" />
		</DataTableFooter>
	);
}

describe('DataTable binding contract', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockTableMeta = undefined;
		mockFooterProps = undefined;
		mockDefaultFooterProps = undefined;
		mockColumns = [{ key: 'level', show: true }];
		mockResult = { hits: [{ id: 'log-1', record: { payload: { level: 'error' } } }] };
	});

	function renderEmptyStateTable() {
		const BindingDataTable = DataTable as unknown as React.ComponentType<Record<string, unknown>>;
		render(
			<QueryStateProvider
				collection="logs"
				initialPageSize={1}
				initialSort={{ field: 'level', direction: 'asc' }}
			>
				<BindingDataTable
					id="logs"
					collectionName="logs"
					resource={{ kind: 'resource' }}
					sort={{ field: 'level', direction: 'asc' }}
					actions={{
						setSort: mockSetSort,
						extendLimit: mockExtendLimit,
						setFilter: mockSetFilter,
					}}
					active$={of(false)}
					total$={of(0)}
					sync={jest.fn(async () => undefined)}
					TableFooterComponent={Footer}
				/>
			</QueryStateProvider>
		);
	}

	it('says "searching", not "no results", while an active search is still pending (#1733)', () => {
		mockResult = { hits: [], searchActive: true, searchState: 'pending' };
		renderEmptyStateTable();

		expect(screen.getByTestId('search-pending-message').textContent).toBe('common.searching');
		expect(screen.queryByTestId('no-data-message')).toBeNull();
	});

	it('says "no results" only once the search has actually answered', () => {
		mockResult = { hits: [], searchActive: true, searchState: 'answered' };
		renderEmptyStateTable();

		expect(screen.getByTestId('no-data-message').textContent).toBe('common.no_results_found');
		expect(screen.queryByTestId('search-pending-message')).toBeNull();
	});

	it('uses binding actions for sorting and pagination and publishes only filter actions to cells', () => {
		const resource = { kind: 'resource' };
		const active$ = of(false);
		const total$ = of(27);
		const sync = jest.fn(async () => undefined);
		const BindingDataTable = DataTable as unknown as React.ComponentType<Record<string, unknown>>;

		render(
			<QueryStateProvider
				collection="logs"
				initialPageSize={1}
				initialSort={{ field: 'level', direction: 'asc' }}
			>
				<BindingDataTable
					id="logs"
					collectionName="logs"
					resource={resource}
					sort={{ field: 'level', direction: 'asc' }}
					actions={{
						setSort: mockSetSort,
						extendLimit: mockExtendLimit,
						setFilter: mockSetFilter,
					}}
					active$={active$}
					total$={total$}
					sync={sync}
					renderItem={({ table }: { table: { options: { meta?: Record<string, unknown> } } }) => {
						mockTableMeta = table.options.meta;
						return <div />;
					}}
					TableFooterComponent={Footer}
				/>
			</QueryStateProvider>
		);

		fireEvent.click(screen.getByTestId('sort-level'));
		fireEvent.click(screen.getByTestId('end-reached'));

		expect(mockPatchUI).toHaveBeenCalledWith({ sortBy: 'level', sortDirection: 'asc' });
		expect(mockSetSort).toHaveBeenCalledWith('level', 'asc');
		expect(mockExtendLimit).toHaveBeenCalledTimes(1);
		expect(mockTableMeta).toEqual({ actions: { setFilter: mockSetFilter } });
		expect(mockTableMeta).not.toHaveProperty('query');
		expect(mockFooterProps).toMatchObject({
			collectionName: 'logs',
			count: 1,
			active$,
			total$,
			sync,
		});
		expect(mockFooterProps).not.toHaveProperty('query');
		expect(screen.getByTestId('sort-level').getAttribute('data-sort-by')).toBe('level');
		expect(screen.getByTestId('sort-level').getAttribute('data-sort-direction')).toBe('asc');
	});

	it('renders the default footer from binding projections', () => {
		const resource = { kind: 'resource' };
		const active$ = of(false);
		const total$ = of(27);
		const sync = jest.fn(async () => undefined);
		const BindingDataTable = DataTable as unknown as React.ComponentType<Record<string, unknown>>;

		render(
			<QueryStateProvider
				collection="coupons"
				initialPageSize={1}
				initialSort={{ field: 'code', direction: 'desc' }}
			>
				<BindingDataTable
					id="coupons"
					collectionName="coupons"
					resource={resource}
					sort={{ field: 'code', direction: 'desc' }}
					actions={{
						setSort: mockSetSort,
						extendLimit: mockExtendLimit,
						setFilter: mockSetFilter,
					}}
					active$={active$}
					total$={total$}
					sync={sync}
				/>
			</QueryStateProvider>
		);

		expect(mockDefaultFooterProps).toMatchObject({
			collectionName: 'coupons',
			count: 1,
			active$,
			total$,
			sync,
		});
		expect(mockDefaultFooterProps).not.toHaveProperty('query');
	});

	it('resolves row cell maps and keeps the text fallback inside the table', () => {
		mockColumns = [
			{ key: 'level', show: true },
			{ key: 'timestamp', show: true },
		];
		const BindingDataTable = DataTable as unknown as React.ComponentType<Record<string, unknown>>;
		function FlatCell() {
			return <div data-testid="flat-cell" />;
		}
		function RowCell() {
			return <div data-testid="row-cell" />;
		}
		const cellsForRow = jest.fn(() => ({ level: RowCell }));

		render(
			<QueryStateProvider
				collection="logs"
				initialPageSize={1}
				initialSort={{ field: 'level', direction: 'asc' }}
			>
				<BindingDataTable
					id="logs"
					collectionName="logs"
					resource={{ kind: 'resource' }}
					sort={{ field: 'level', direction: 'asc' }}
					actions={{
						setSort: mockSetSort,
						extendLimit: mockExtendLimit,
						setFilter: mockSetFilter,
					}}
					active$={of(false)}
					total$={of(1)}
					sync={jest.fn(async () => undefined)}
					cells={{ level: FlatCell, timestamp: FlatCell }}
					cellsForRow={cellsForRow}
					showFooter={false}
				/>
			</QueryStateProvider>
		);

		expect(screen.getByTestId('row-cell')).toBeTruthy();
		expect(screen.queryByTestId('flat-cell')).toBeNull();
		expect(screen.getByTestId('record-text-timestamp')).toBeTruthy();
		expect(cellsForRow).toHaveBeenCalledWith(
			expect.objectContaining({ original: expect.objectContaining({ id: 'log-1' }) })
		);
	});

	it('clears the explicit products collection when the table id names a screen', () => {
		const BindingDataTable = DataTable as unknown as React.ComponentType<Record<string, unknown>>;

		render(
			<QueryStateProvider
				collection="products"
				initialPageSize={1}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<BindingDataTable
					id="pos-products"
					collectionName="products"
					resource={{ kind: 'resource' }}
					sort={{ field: 'name', direction: 'asc' }}
					actions={{
						setSort: mockSetSort,
						extendLimit: mockExtendLimit,
						setFilter: mockSetFilter,
					}}
					active$={of(false)}
					total$={of(27)}
					sync={jest.fn(async () => undefined)}
					TableFooterComponent={TaxFooter}
				/>
			</QueryStateProvider>
		);

		expect(screen.getByTestId('tax-based-on')).toBeTruthy();
		fireEvent.click(screen.getByTestId('clear-and-refresh'));
		expect(mockClearAndRefresh).toHaveBeenCalledWith('products');
	});

	/**
	 * Regression guard for the react-table v9 migration.
	 *
	 * Under v8 the table instance was rebuilt into a fresh object on every render
	 * (`{ ...useReactTable(...) }`) purely so React Compiler could not serve a
	 * memoized view of a table whose internals had mutated underneath it
	 * (facebook/react#33057). v9 forbids that spread — its methods live on
	 * prototypes — so the identity is now stable and correctness rests entirely on
	 * v9's store subscription.
	 *
	 * This file is compiled by the React Compiler in jest (see the transform
	 * routing in jest.config.js), so a stale memo here fails the test rather than
	 * reaching a cashier as a column toggle that does nothing.
	 */
	it('re-renders header cells when the visible column set changes', () => {
		mockColumns = [
			{ key: 'level', show: true },
			{ key: 'timestamp', show: true },
		];
		const BindingDataTable = DataTable as unknown as React.ComponentType<Record<string, unknown>>;
		const props = {
			id: 'logs',
			collectionName: 'logs',
			resource: { kind: 'resource' },
			sort: { field: 'level', direction: 'asc' as const },
			actions: {
				setSort: mockSetSort,
				extendLimit: mockExtendLimit,
				setFilter: mockSetFilter,
			},
			active$: of(false),
			total$: of(27),
			sync: jest.fn(async () => undefined),
			TableFooterComponent: Footer,
		};

		const { rerender } = render(
			<QueryStateProvider
				collection="logs"
				initialPageSize={1}
				initialSort={{ field: 'level', direction: 'asc' }}
			>
				<BindingDataTable {...props} />
			</QueryStateProvider>
		);

		expect(screen.queryByTestId('sort-level')).toBeTruthy();
		expect(screen.queryByTestId('sort-timestamp')).toBeTruthy();

		// Hide a column, exactly as the column-visibility popover does.
		mockColumns = [{ key: 'level', show: true }];
		rerender(
			<QueryStateProvider
				collection="logs"
				initialPageSize={1}
				initialSort={{ field: 'level', direction: 'asc' }}
			>
				<BindingDataTable {...props} />
			</QueryStateProvider>
		);

		expect(screen.queryByTestId('sort-level')).toBeTruthy();
		expect(screen.queryByTestId('sort-timestamp')).toBeNull();
	});
});
