/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import {
	extendLimit,
	handleWith,
	patchUI,
	renderTable,
	reset,
	setFilter,
	setSort,
	state,
	tableTree,
} from './test-fixture';
import { DataTableRow } from './rows';
import { DataTableSkeleton } from './skeleton';

import type { DataTableFooterProps } from './footer';

beforeEach(reset);
it('fine headers fill their cells and sorting keeps the applied-sort marker', () => {
	renderTable();
	expect(screen.getByRole('table')).toBeTruthy();
	const header = screen.getByTestId('data-table-header-name');
	expect(header.style.flex).toBe('1 1 0%');
	expect(header.style.alignSelf).toBe('stretch');
	const sortRow = screen.getByTestId('data-table-sort-name-asc');
	// A sortable label truncates inside its cell instead of overflowing the next column:
	// the row is capped at the cell and the label may shrink (a non-sortable header's
	// plain Text already does).
	expect(sortRow.style.maxWidth).toBe('100%');
	expect((sortRow.firstElementChild as HTMLElement).style.flexShrink).toBe('1');
	fireEvent.click(header);
	expect(setSort).toHaveBeenCalledWith('name', 'desc');
	expect(patchUI).toHaveBeenCalledWith({ sortBy: 'name', sortDirection: 'desc' });
});
it('coarse composes visible cells and a caller trailing slot in a pressable row, without headers', () => {
	state.pointer = 'coarse';
	const onPress = jest.fn();
	renderTable({
		renderItem: ({ item }: React.ComponentProps<typeof DataTableRow>) => (
			<DataTableRow
				item={item}
				onPress={onPress}
				trailing={<span data-testid="trailing">+</span>}
			/>
		),
	});
	expect(screen.queryByTestId('data-table-header-name')).toBeNull();
	expect(screen.getByTestId('cell-name')).toBeTruthy();
	expect(screen.getByTestId('cell-price')).toBeTruthy();
	expect(screen.queryByTestId('cell-actions')).toBeNull();
	// The row's testID holds its trailing control: specs find a row's `+` inside the row.
	expect(within(screen.getByTestId('data-table-row-uuid-1')).getByTestId('trailing')).toBeTruthy();
	fireEvent.click(screen.getByTestId('cell-name'));
	expect(onPress).toHaveBeenCalledTimes(1);
});
it('a labelled row is itself a button: a press on its cells is the row press', () => {
	// #2284: the drill-in variation row names itself, so on web the row pressable renders a
	// <button>. The inner-control guard found that very button and dropped every click.
	const onPress = jest.fn();
	renderTable({
		renderItem: ({ item }: React.ComponentProps<typeof DataTableRow>) => (
			<DataTableRow item={item} onPress={onPress} accessibilityLabel="Tea" />
		),
	});
	fireEvent.click(screen.getByTestId('cell-name'));
	expect(onPress).toHaveBeenCalledTimes(1);
});
it('a press on a control inside a cell stays that control’s', () => {
	const onPress = jest.fn();
	renderTable({
		cells: { name: () => <button data-testid="cell-control">edit</button> },
		renderItem: ({ item }: React.ComponentProps<typeof DataTableRow>) => (
			<DataTableRow item={item} onPress={onPress} />
		),
	});
	fireEvent.click(screen.getByTestId('cell-control'));
	expect(onPress).not.toHaveBeenCalled();
});
it('keeps the pending search distinct from empty results', () => {
	state.result = { hits: [], searchActive: true, searchState: 'pending' };
	renderTable();
	expect(screen.getByTestId('search-pending-message').textContent).toBe('common.searching');
	expect(screen.queryByTestId('no-data-message')).toBeNull();
});
it('an empty list shows skeleton rows while the collection is syncing, the empty state once it settles', () => {
	state.result = { hits: [], searchActive: false, searchState: 'answered' };
	const handle = handleWith({ active: true });
	renderTable({ handle, noDataMessage: <span data-testid="empty-state">No customers yet</span> });
	expect(screen.getByTestId('data-table-syncing-rows')).toBeTruthy();
	expect(screen.getAllByTestId('data-table-skeleton-name')).toHaveLength(5);
	expect(screen.queryByTestId('empty-state')).toBeNull();
	act(() => handle.set({ active: false }));
	expect(screen.queryByTestId('data-table-syncing-rows')).toBeNull();
	expect(screen.getByTestId('empty-state')).toBeTruthy();
});
it('a pending search says so even while the collection is syncing', () => {
	state.result = { hits: [], searchActive: true, searchState: 'pending' };
	renderTable({ handle: handleWith({ active: true }) });
	expect(screen.getByTestId('search-pending-message')).toBeTruthy();
	expect(screen.queryByTestId('data-table-syncing-rows')).toBeNull();
});
it('unknown totals print only the loaded count', () => {
	renderTable();
	expect(screen.getByTestId('data-table-loaded-count').textContent).toBe('1');
	expect(screen.getByTestId('data-table-count').textContent).toBe(
		'{"key":"common.showing_n","shown":"1"}'
	);
	expect(screen.getByTestId('data-table-total-count').textContent).toBe('');
});
it('skeleton follows visible columns, with a capped row count', () => {
	state.columns[1].show = false;
	render(<DataTableSkeleton id="pos-products" rowCount={100} />);
	expect(screen.getAllByTestId('data-table-skeleton-name')).toHaveLength(12);
	expect(screen.getAllByTestId('data-table-skeleton-actions')).toHaveLength(12);
	expect(screen.queryByTestId('data-table-skeleton-price')).toBeNull();
	// A line of text in a real cell, not a bar the height of a row: the skeleton row is as
	// tall as its cells make it, which is what keeps it the size of the row that replaces it.
	expect(screen.getAllByTestId('data-table-skeleton-name')[0].dataset.shape).toBe('line');
});

// The screens' tables read the query handle (roadmap#423).
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => import('@wcpos/query').QueryHandle & {
		set(partial: Record<string, unknown>): void;
	};
};
it('the drawn rows stay while a changed handle answers, then its rows show', async () => {
	const hit = (id: string) => ({ id, record: { uuid: id, payload: { name: id } } });
	const first = fakeQueryHandle({
		result: { hits: [hit('tea')], searchActive: false, searchState: 'answered' },
	});
	// The screen's boundary: a table that suspended on the changed handle would show this.
	const tree = (handle: unknown) => (
		<React.Suspense fallback={<div data-testid="table-fallback" />}>
			{tableTree({ handle })}
		</React.Suspense>
	);
	const { rerender } = render(tree(first));
	expect(screen.getByTestId('data-table-loaded-count').textContent).toBe('1');
	// A changed query: an unanswered handle. The table defers it: the first rows stay drawn.
	const next = fakeQueryHandle({ ready: false });
	rerender(tree(next));
	expect(screen.queryByTestId('table-fallback')).toBeNull();
	expect(screen.getByTestId('data-table-loaded-count').textContent).toBe('1');
	await act(async () =>
		next.set({
			ready: true,
			result: { hits: [hit('coffee'), hit('milk')], searchActive: false, searchState: 'answered' },
		})
	);
	expect(screen.getByTestId('data-table-loaded-count').textContent).toBe('2');
});
// A custom footer (the products screen's `TableFooter` → `DataTableFooter` + `TaxBasedOn`) takes
// values: the drawn handle's `total` lands in the same commit as the count it describes.
it('a custom footer gets the drawn total as a value in the rows’ commit', async () => {
	const hit = (id: string) => ({ id, record: { uuid: id, payload: { name: id } } });
	const renders: { count: number; total: number | null | undefined }[] = [];
	function Probe({ count, total }: DataTableFooterProps) {
		renders.push({ count, total });
		return <div data-testid="footer-probe">{`${count}/${String(total)}`}</div>;
	}
	const first = fakeQueryHandle({
		result: { hits: [hit('tea')], searchActive: false, searchState: 'answered' },
		total: 5,
	});
	const tree = (handle: unknown) => (
		<React.Suspense fallback={<div data-testid="table-fallback" />}>
			{tableTree({ TableFooterComponent: Probe, handle })}
		</React.Suspense>
	);
	const { rerender } = render(tree(first));
	expect(screen.getByTestId('footer-probe').textContent).toBe('1/5');
	// A changed query: the previous handle's rows and total stay while the new one answers.
	const next = fakeQueryHandle({ ready: false, total: 99 });
	rerender(tree(next));
	expect(screen.queryByTestId('table-fallback')).toBeNull();
	expect(screen.getByTestId('footer-probe').textContent).toBe('1/5');
	renders.length = 0;
	await act(async () =>
		next.set({
			ready: true,
			result: { hits: [hit('coffee'), hit('milk')], searchActive: false, searchState: 'answered' },
			total: 9,
		})
	);
	expect(screen.getByTestId('footer-probe').textContent).toBe('2/9');
	// Never the new count over the old denominator (or none), not even for one commit.
	expect(renders.filter(({ count }) => count === 2).every(({ total }) => total === 9)).toBe(true);
	expect(renders.some(({ count, total }) => count === 1 && total !== 5)).toBe(false);
});

it('the default footer is the caption row: the drawn total, the live spinner, the live sync', async () => {
	const hit = (id: string) => ({ id, record: { uuid: id, payload: { name: id } } });
	const drawn = fakeQueryHandle({
		result: { hits: [hit('tea')], searchActive: false, searchState: 'answered' },
		total: 5,
		active: false,
	});
	const drawnSync = jest.fn(async () => undefined);
	Object.assign(drawn, { sync: drawnSync });
	const tree = (handle: unknown) => (
		<React.Suspense fallback={<div data-testid="table-fallback" />}>
			{tableTree({ handle })}
		</React.Suspense>
	);
	const { rerender } = render(tree(drawn));
	// A changed query, unanswered: it is the live handle (pulling, its own total), the previous
	// one stays drawn.
	const live = fakeQueryHandle({ ready: false, total: 99, active: true });
	const liveSync = jest.fn(async () => undefined);
	Object.assign(live, { sync: liveSync });
	rerender(tree(live));

	// The mount owns the caption row's inset (surface.tsx `CaptionRowInset`), not the footer.
	expect(
		screen
			.getByTestId('data-table-caption-inset')
			.contains(screen.getByTestId('data-table-caption-row'))
	).toBe(true);
	expect(screen.getByTestId('data-table-loaded-count').textContent).toBe('1');
	expect(screen.getByTestId('data-table-total-count').textContent).toBe('5');
	expect(screen.getByTestId('sync-button').dataset.active).toBe('true');
	fireEvent.click(screen.getByTestId('sync-button'));
	expect(liveSync).toHaveBeenCalledTimes(1);
	expect(drawnSync).not.toHaveBeenCalled();
});

it('a custom footer is handed values, never streams, with the table’s collection', () => {
	const props: DataTableFooterProps[] = [];
	function Footer(footer: DataTableFooterProps) {
		props.push(footer);
		return null;
	}
	const handle = handleWith({ total: 27, active: true });
	renderTable({ handle, TableFooterComponent: Footer });
	expect(props.at(-1)).toEqual({
		collectionName: 'products',
		count: 1,
		active: true,
		total: 27,
		sync: handle.sync,
	});
});

it('a list footer is handed the live handle’s activity as a value', () => {
	const seen: boolean[] = [];
	function ListFooter({ active }: { active: boolean }) {
		seen.push(active);
		return null;
	}
	const handle = handleWith({ active: true });
	renderTable({ handle, ListFooterComponent: ListFooter });
	expect(seen.at(-1)).toBe(true);
	act(() => handle.set({ active: false }));
	expect(seen.at(-1)).toBe(false);
});

it('pages through the actions on a full read, and holds while the handle’s demand is pending', () => {
	// One row at a page size of one: a full read, which always extends.
	const handle = handleWith({ pending: true });
	renderTable({ handle });
	fireEvent.click(screen.getByTestId('end-reached'));
	expect(extendLimit).not.toHaveBeenCalled();
	act(() => handle.set({ pending: false }));
	fireEvent.click(screen.getByTestId('end-reached'));
	expect(extendLimit).toHaveBeenCalledTimes(1);
});

it('publishes only the filter action to the cells', () => {
	let meta: Record<string, unknown> | undefined;
	renderTable({
		renderItem: ({ table }: { table: { options: { meta?: Record<string, unknown> } } }) => {
			meta = table.options.meta;
			return <div />;
		},
	});
	expect(meta).toEqual({ actions: { setFilter } });
});

it('resolves row cell maps and keeps the text fallback inside the table', () => {
	function RowCell() {
		return <div data-testid="row-cell" />;
	}
	function FlatCell() {
		return <div data-testid="flat-cell" />;
	}
	const cellsForRow = jest.fn(() => ({ name: RowCell }));
	renderTable({ cells: { name: FlatCell, price: FlatCell }, cellsForRow, showFooter: false });
	expect(screen.getByTestId('row-cell')).toBeTruthy();
	expect(screen.queryByTestId('flat-cell')).toBeNull();
	expect(screen.getByTestId('cell-price')).toBeTruthy();
	expect(cellsForRow).toHaveBeenCalledWith(
		expect.objectContaining({ original: expect.objectContaining({ id: 'hit-1' }) })
	);
});

/**
 * Regression guard for the react-table v9 migration (see the NOTE in `DataTableBody`): this file
 * runs against the table compiled by the React Compiler, as the app compiles it, so a stale memo
 * fails here rather than reaching a cashier as a column toggle that does nothing.
 */
it('re-renders header cells when the visible column set changes', () => {
	const handle = handleWith();
	const { rerender } = renderTable({ handle });
	expect(screen.queryByTestId('data-table-header-name')).toBeTruthy();
	expect(screen.queryByTestId('data-table-header-price')).toBeTruthy();
	// Hide a column, exactly as the column-visibility popover does.
	state.columns = state.columns.filter(({ key }) => key !== 'price');
	rerender(tableTree({ handle }));
	expect(screen.queryByTestId('data-table-header-name')).toBeTruthy();
	expect(screen.queryByTestId('data-table-header-price')).toBeNull();
});
