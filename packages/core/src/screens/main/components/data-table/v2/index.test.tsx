/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import { patchUI, renderTable, reset, setSort, state } from './test-fixture';
import { DataTableRow } from './rows';
import { DataTableSkeleton } from './skeleton';

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
it('keeps the pending search distinct from empty results', () => {
	state.result = { hits: [], searchActive: true, searchState: 'pending' };
	renderTable();
	expect(screen.getByTestId('search-pending-message').textContent).toBe('common.searching');
	expect(screen.queryByTestId('no-data-message')).toBeNull();
});
it('an empty list shows skeleton rows while the collection is syncing, the empty state once it settles', () => {
	state.result = { hits: [], searchActive: false, searchState: 'answered' };
	const active$ = new BehaviorSubject(true);
	renderTable({ active$, noDataMessage: <span data-testid="empty-state">No customers yet</span> });
	expect(screen.getByTestId('data-table-syncing-rows')).toBeTruthy();
	expect(screen.getAllByTestId('data-table-skeleton-name')).toHaveLength(5);
	expect(screen.queryByTestId('empty-state')).toBeNull();
	act(() => active$.next(false));
	expect(screen.queryByTestId('data-table-syncing-rows')).toBeNull();
	expect(screen.getByTestId('empty-state')).toBeTruthy();
});
it('a pending search says so even while the collection is syncing', () => {
	state.result = { hits: [], searchActive: true, searchState: 'pending' };
	renderTable({ active$: of(true) });
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
	expect(screen.getAllByTestId('data-table-skeleton-name')[0].dataset.shape).toBe('row');
});
