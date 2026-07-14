/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { DataTable } from './index';

const mockSetSort = jest.fn();
const mockExtendLimit = jest.fn();
const mockSetFilter = jest.fn();
const mockPatchUI = jest.fn();
let mockTableMeta: Record<string, unknown> | undefined;
let mockFooterProps: Record<string, unknown> | undefined;
let mockDefaultFooterProps: Record<string, unknown> | undefined;

jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => [{ key: 'level', show: true }],
	useObservableSuspense: () => ({
		hits: [{ id: 'log-1', document: { level: 'error' } }],
	}),
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
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
	}: {
		data: unknown[];
		renderItem: (input: { item: unknown; index: number }) => React.ReactNode;
		onEndReached: () => void;
	}) => (
		<div>
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
		onSortingChange,
	}: {
		columnId: string;
		onSortingChange: (sort: { sortBy: string; sortDirection: 'asc' }) => void;
	}) => (
		<button
			data-testid={`sort-${columnId}`}
			onClick={() => onSortingChange({ sortBy: columnId, sortDirection: 'asc' })}
		/>
	),
}));
jest.mock('./footer', () => ({
	DataTableFooter: (props: Record<string, unknown>) => {
		mockDefaultFooterProps = props;
		return null;
	},
}));
jest.mock('./list-footer', () => ({ ListFooterComponent: () => null }));
jest.mock('../../components/text-cell', () => ({ TextCell: () => null }));

function Footer(props: Record<string, unknown>) {
	mockFooterProps = props;
	return null;
}

describe('DataTable binding contract', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockTableMeta = undefined;
		mockFooterProps = undefined;
		mockDefaultFooterProps = undefined;
	});

	it('uses binding actions for sorting and pagination and publishes only filter actions to cells', () => {
		const resource = { kind: 'resource' };
		const active$ = of(false);
		const total$ = of(27);
		const totalSource$ = of('local' as const);
		const sync = jest.fn(async () => undefined);
		const BindingDataTable = DataTable as unknown as React.ComponentType<Record<string, unknown>>;

		render(
			<BindingDataTable
				id="logs"
				resource={resource}
				actions={{
					setSort: mockSetSort,
					extendLimit: mockExtendLimit,
					setFilter: mockSetFilter,
				}}
				active$={active$}
				total$={total$}
				totalSource$={totalSource$}
				sync={sync}
				renderItem={({ table }: { table: { options: { meta?: Record<string, unknown> } } }) => {
					mockTableMeta = table.options.meta;
					return <div />;
				}}
				TableFooterComponent={Footer}
			/>
		);

		fireEvent.click(screen.getByTestId('sort-level'));
		fireEvent.click(screen.getByTestId('end-reached'));

		expect(mockPatchUI).toHaveBeenCalledWith({ sortBy: 'level', sortDirection: 'asc' });
		expect(mockSetSort).toHaveBeenCalledWith('level', 'asc');
		expect(mockExtendLimit).toHaveBeenCalledTimes(1);
		expect(mockTableMeta).toEqual({ actions: { setFilter: mockSetFilter } });
		expect(mockTableMeta).not.toHaveProperty('query');
		expect(mockFooterProps).toMatchObject({
			count: 1,
			active$,
			total$,
			totalSource$,
			sync,
		});
		expect(mockFooterProps).not.toHaveProperty('query');
	});

	it('renders the default footer from binding projections', () => {
		const resource = { kind: 'resource' };
		const active$ = of(false);
		const total$ = of(27);
		const totalSource$ = of('coverage' as const);
		const sync = jest.fn(async () => undefined);
		const BindingDataTable = DataTable as unknown as React.ComponentType<Record<string, unknown>>;

		render(
			<BindingDataTable
				id="coupons"
				resource={resource}
				actions={{
					setSort: mockSetSort,
					extendLimit: mockExtendLimit,
					setFilter: mockSetFilter,
				}}
				active$={active$}
				total$={total$}
				totalSource$={totalSource$}
				sync={sync}
			/>
		);

		expect(mockDefaultFooterProps).toMatchObject({
			collectionName: 'coupons',
			count: 1,
			active$,
			total$,
			totalSource$,
			sync,
		});
		expect(mockDefaultFooterProps).not.toHaveProperty('query');
	});
});
