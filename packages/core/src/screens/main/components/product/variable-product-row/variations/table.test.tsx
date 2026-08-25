/**
 * @jest-environment jsdom
 *
 * The expanded variation rows answer to the products list's Stock Status pill.
 *
 * Reported against the demo store 2026-08-25: with every filter cleared, expanding
 * "Chromatic" showed 4 of its 20 colours — the four in stock — because the table filtered on
 * the `showOutOfStock` display setting instead of the live filter.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { ObservableResource } from 'observable-hooks';

import { VariationsTable } from './table';

import type { CellContext } from '../../../../../../table-types';

jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/lib/utils', () => ({ cn: () => '' }));
jest.mock('@wcpos/components/table', () => ({
	TableRow: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	TableCell: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../../../data-table', () => ({ getColumnStyle: () => ({}) }));
jest.mock('../../../record-text-cell', () => ({ RecordTextCell: () => null }));
jest.mock('./footer', () => ({
	VariationTableFooter: ({ count }: { count: number }) => (
		<div data-testid="variations-footer-count">{count}</div>
	),
}));

/** Colour, manage_stock + quantity, and the server's flag — the shapes a real variation has. */
const variations = [
	{ name: 'Black', manage_stock: true, stock_quantity: 8, stock_status: 'instock' },
	{ name: 'Red', manage_stock: true, stock_quantity: 0, stock_status: 'outofstock' },
	{ name: 'Blue', manage_stock: false, stock_status: 'outofstock' },
	{ name: 'Gold', manage_stock: true, stock_quantity: 0, backorders: 'notify' },
];

const hits$ = new BehaviorSubject({
	hits: variations.map((payload, index) => ({
		id: `v${index}`,
		record: { remoteId: String(index), payload },
	})),
});

const binding = {
	resource: new ObservableResource(hits$),
} as never;

function NameCell(props: CellContext<{ record: { payload: { name: string } } }, unknown>) {
	return <div data-testid="variation-name">{props.row.original.record.payload.name}</div>;
}

const row = {
	id: 'chromatic',
	original: { record: { payload: { id: 13881, type: 'variable' } } },
	getVisibleCells: () => [
		{
			id: 'name',
			column: { id: 'name', columnDef: { meta: {} } },
			getContext: () => ({
				table: { options: { meta: { variationRenderCell: () => NameCell } } },
			}),
		},
	],
} as never;

const renderedNames = () =>
	screen.queryAllByTestId('variation-name').map((node) => node.textContent);

describe('VariationsTable stock filtering', () => {
	it('shows every variation when the Stock Status filter is cleared', () => {
		render(<VariationsTable binding={binding} row={row} />);

		expect(renderedNames()).toEqual(['Black', 'Red', 'Blue', 'Gold']);
		expect(screen.getByTestId('variations-footer-count').textContent).toBe('4');
	});

	it('shows only in-stock variations while the pill reads In stock', () => {
		render(<VariationsTable binding={binding} row={row} stockStatus="instock" />);

		expect(renderedNames()).toEqual(['Black']);
		expect(screen.getByTestId('variations-footer-count').textContent).toBe('1');
	});

	it('shows only out-of-stock variations while the pill reads Out of stock', () => {
		render(<VariationsTable binding={binding} row={row} stockStatus="outofstock" />);

		// Blue has no quantity of its own, so the server's flag is the only word on it.
		expect(renderedNames()).toEqual(['Red', 'Blue']);
	});

	it('shows the backordered variation while the pill reads On backorder', () => {
		render(<VariationsTable binding={binding} row={row} stockStatus="onbackorder" />);

		expect(renderedNames()).toEqual(['Gold']);
	});
});
