/**
 * @jest-environment jsdom
 *
 * Regression test for the 5-10s column-change lag on variable products.
 *
 * The app builds with React Compiler (apps/main app.config.ts experiments.reactCompiler),
 * which memoizes the `item.getVisibleCells()` JSX in VariableProductRow keyed only on the
 * tanstack Row object — and Row identity is stable across columnVisibility changes, so
 * toggling a column left variable rows (and their variation subrows) rendering the old
 * columns until the next data emission recreated the rows.
 *
 * VariableProductRow and variations/table.tsx are routed through the react-compiler jest
 * transformer (see jest.config.js) so this test renders them exactly as the app does.
 */
import * as React from 'react';

import { columnVisibilityFeature, tableFeatures, useTable } from '@tanstack/react-table';
import { act, render } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { ObservableResource } from 'observable-hooks';

import { VariableProductRow } from './index';

import type { ColumnVisibilityState } from '@tanstack/react-table';
import type { CellContext, ColumnDef } from '../../../../../table-types';

const features = tableFeatures({ columnVisibilityFeature });

type TestTableFeatures = typeof features;

jest.mock('react-native', () => ({
	View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ScrollView: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('react-native-reanimated', () => {
	const React = require('react');
	return {
		__esModule: true,
		default: {
			View: ({ children }: { children?: React.ReactNode }) =>
				React.createElement('div', null, children),
		},
		useSharedValue: (value: unknown) => ({ value }),
		useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
		useAnimatedStyle: () => ({}),
		withTiming: (value: unknown, _config: unknown, cb?: (finished: boolean) => void) => {
			cb?.(true);
			return value;
		},
	};
});
jest.mock('react-native-worklets', () => ({
	scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/table', () => ({
	TableRow: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	TableCell: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('../../data-table', () => ({
	getColumnStyle: () => ({}),
}));
jest.mock('./context', () => ({
	VariationRowProvider: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('./variations/filters', () => ({
	VariationsFilterBar: () => null,
}));
jest.mock('./variations/footer', () => ({
	VariationTableFooter: () => null,
}));
jest.mock('../../record-text-cell', () => ({
	RecordTextCell: () => null,
}));
jest.mock('../resolve-stock', () => ({
	resolveStock: () => ({ sellable: true }),
}));

const variationHits$ = new BehaviorSubject({
	hits: [
		{
			id: 'v11',
			document: { id: 11, type: 'variation' },
			record: { remoteId: '11', payload: { id: 11, type: 'variation' } },
		},
	],
});
const binding = {
	resource: new ObservableResource(variationHits$),
	sync: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../../../../../query', () => ({
	useQueryState: () => ({}),
	useQueryStateActions: () => ({ clearSearch: jest.fn(), resetFilters: jest.fn() }),
	useCollectionBinding: () => binding,
}));

type RowData = {
	id: string;
	document: Record<string, unknown>;
	record: { remoteId: string; payload: Record<string, unknown> };
};

const columns: ColumnDef<RowData, unknown, TestTableFeatures>[] = [
	{
		accessorKey: 'name',
		cell: () => <span>parent-name-cell</span>,
	},
	{
		accessorKey: 'price',
		cell: () => <span>parent-price-cell</span>,
	},
];

const variations$ = new BehaviorSubject([11]);
const data: RowData[] = [
	{
		id: 'p1',
		document: { id: 1, type: 'variable', slug: 'variable-product', variations$, variations: [11] },
		record: {
			remoteId: '1',
			payload: { id: 1, type: 'variable', slug: 'variable-product', variations: [11] },
		},
	},
];

const expanded$ = new BehaviorSubject<Record<string, boolean>>({ p1: true });

const variationCells: Record<string, React.ComponentType> = {
	name: () => <span>variation-name-cell</span>,
	price: () => <span>variation-price-cell</span>,
};

// The test file itself is transformed by ts-jest, so Harness is never compiled
// by React Compiler — only the imported components under test are (see the
// react-compiler transform routing in jest.config.js).
function Harness({ visibility }: { visibility: ColumnVisibilityState }) {
	const table = useTable({
		features,
		data,
		columns,
		getRowId: (row) => row.id,
		state: { columnVisibility: visibility },
		meta: {
			expanded$,
			variationRenderCell: ({ column }: CellContext<RowData, unknown, TestTableFeatures>) =>
				variationCells[column.id] ?? null,
		} as never,
	});
	const row = table.getRowModel().rows[0];
	return <VariableProductRow item={row as never} index={0} table={table as never} />;
}

describe('variable product row column visibility', () => {
	it('drops hidden columns from the parent row and variation subrows immediately', () => {
		const view = render(<Harness visibility={{ name: true, price: true }} />);

		expect(view.queryByText('parent-name-cell')).toBeTruthy();
		expect(view.queryByText('parent-price-cell')).toBeTruthy();
		expect(view.queryByText('variation-name-cell')).toBeTruthy();
		expect(view.queryByText('variation-price-cell')).toBeTruthy();

		act(() => {
			view.rerender(<Harness visibility={{ name: true, price: false }} />);
		});

		expect(view.queryByText('parent-name-cell')).toBeTruthy();
		expect(view.queryByText('parent-price-cell')).toBeNull();
		expect(view.queryByText('variation-name-cell')).toBeTruthy();
		expect(view.queryByText('variation-price-cell')).toBeNull();

		act(() => {
			view.rerender(<Harness visibility={{ name: true, price: true }} />);
		});

		expect(view.queryByText('parent-price-cell')).toBeTruthy();
		expect(view.queryByText('variation-price-cell')).toBeTruthy();
	});
});
