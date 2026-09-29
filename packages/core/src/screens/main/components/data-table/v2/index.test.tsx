/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

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
	expect(screen.getByTestId('data-table-sort-name-asc')).toBeTruthy();
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
	expect(screen.getByTestId('trailing')).toBeTruthy();
	fireEvent.click(screen.getByTestId('data-table-row-uuid-1'));
	expect(onPress).toHaveBeenCalledTimes(1);
});
it('keeps the pending search distinct from empty results', () => {
	state.result = { hits: [], searchActive: true, searchState: 'pending' };
	renderTable();
	expect(screen.getByTestId('search-pending-message').textContent).toBe('common.searching');
	expect(screen.queryByTestId('no-data-message')).toBeNull();
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
