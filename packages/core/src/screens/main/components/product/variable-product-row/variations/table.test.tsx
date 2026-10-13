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

import { act, render, screen } from '@testing-library/react';

import { VariationsTable } from './table';

import type { CellContext } from '../../../../../../table-types';

jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('@wcpos/components/lib/utils', () => ({ cn: () => '' }));
jest.mock('@wcpos/components/table', () => ({
	TableRow: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	TableCell: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../../../data-table/column-style', () => ({ getColumnStyle: () => ({}) }));
jest.mock('../../../record-text-cell', () => ({ RecordTextCell: () => null }));
let mockFooterProps: { handle?: unknown; shown?: unknown } = {};
jest.mock('./footer', () => ({
	VariationTableFooter: (props: { count: number; handle: unknown; shown: unknown }) => {
		mockFooterProps = props;
		return <div data-testid="variations-footer-count">{props.count}</div>;
	},
}));

/** Colour, manage_stock + quantity, and the server's flag — the shapes a real variation has. */
const variations = [
	{ name: 'Black', manage_stock: true, stock_quantity: 8, stock_status: 'instock' },
	{ name: 'Red', manage_stock: true, stock_quantity: 0, stock_status: 'outofstock' },
	{ name: 'Blue', manage_stock: false, stock_status: 'outofstock' },
	{ name: 'Gold', manage_stock: true, stock_quantity: 0, backorders: 'notify' },
];

// A query handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};

const hitsOf = (payloads: typeof variations) =>
	payloads.map((payload, index) => ({
		id: `v${index}`,
		record: { remoteId: String(index), payload },
	}));

const handle = fakeQueryHandle({ result: { hits: hitsOf(variations) } });

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
		render(<VariationsTable handle={handle} row={row} />);

		expect(renderedNames()).toEqual(['Black', 'Red', 'Blue', 'Gold']);
		expect(screen.getByTestId('variations-footer-count').textContent).toBe('4');
	});

	it('shows only in-stock variations while the pill reads In stock', () => {
		render(<VariationsTable handle={handle} row={row} stockStatus="instock" />);

		expect(renderedNames()).toEqual(['Black']);
		expect(screen.getByTestId('variations-footer-count').textContent).toBe('1');
	});

	it('shows only out-of-stock variations while the pill reads Out of stock', () => {
		render(<VariationsTable handle={handle} row={row} stockStatus="outofstock" />);

		// Blue has no quantity of its own, so the server's flag is the only word on it.
		expect(renderedNames()).toEqual(['Red', 'Blue']);
	});

	it('shows the backordered variation while the pill reads On backorder', () => {
		render(<VariationsTable handle={handle} row={row} stockStatus="onbackorder" />);

		expect(renderedNames()).toEqual(['Gold']);
	});
});

describe('VariationsTable on the variations handle', () => {
	it('suspends until the handle answers, then draws its rows', async () => {
		const cold = fakeQueryHandle({ ready: false });
		render(
			<React.Suspense fallback={<div data-testid="variations-fallback" />}>
				<VariationsTable handle={cold} row={row} />
			</React.Suspense>
		);
		expect(screen.getByTestId('variations-fallback')).toBeTruthy();

		await act(async () => cold.set({ ready: true, result: { hits: hitsOf(variations) } }));
		expect(renderedNames()).toEqual(['Black', 'Red', 'Blue', 'Gold']);
	});

	// A changed search hands a new handle: the current variations stay (no fallback) while it
	// answers, and the footer is told which handle is drawn so its total describes these rows.
	it('keeps the current variations while a changed handle answers, then shows its rows', async () => {
		const first = fakeQueryHandle({ result: { hits: hitsOf(variations) } });
		const view = render(
			<React.Suspense fallback={<div data-testid="variations-fallback" />}>
				<VariationsTable handle={first} row={row} />
			</React.Suspense>
		);
		const next = fakeQueryHandle({ ready: false });
		view.rerender(
			<React.Suspense fallback={<div data-testid="variations-fallback" />}>
				<VariationsTable handle={next} row={row} />
			</React.Suspense>
		);
		expect(screen.queryByTestId('variations-fallback')).toBeNull();
		expect(renderedNames()).toEqual(['Black', 'Red', 'Blue', 'Gold']);
		expect(mockFooterProps).toMatchObject({ handle: next, shown: first });

		await act(async () =>
			next.set({ ready: true, result: { hits: hitsOf(variations.slice(0, 1)) } })
		);
		expect(renderedNames()).toEqual(['Black']);
		expect(mockFooterProps).toMatchObject({ handle: next, shown: next });
	});
});
