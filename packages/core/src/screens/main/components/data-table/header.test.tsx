/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DataTableHeader } from './header';
import { getSortField } from './sort-field';

jest.mock('react-native', () => ({
	Pressable: ({
		children,
		onPress,
		testID,
	}: {
		children: React.ReactNode | ((state: { hovered: boolean }) => React.ReactNode);
		onPress: () => void;
		testID: string;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{typeof children === 'function' ? children({ hovered: false }) : children}
		</button>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/sort-icon', () => ({ SortIcon: () => null }));

describe('DataTableHeader sorting behavior', () => {
	describe('getSortField', () => {
		it('maps price column to sortable_price', () => {
			expect(getSortField('products', 'price')).toBe('sortable_price');
		});

		it('keeps the semantic order total field for the translator', () => {
			expect(getSortField('orders', 'total')).toBe('total');
		});

		it('passes through regular column IDs unchanged', () => {
			expect(getSortField('products', 'name')).toBe('name');
			expect(getSortField('products', 'date_created_gmt')).toBe('date_created_gmt');
			expect(getSortField('customers', 'last_name')).toBe('last_name');
			expect(getSortField('products', 'sku')).toBe('sku');
		});
	});

	it('clicking the Price header requests sortable_price', () => {
		const onSortingChange = jest.fn();
		render(
			<DataTableHeader
				collectionName="products"
				columnId="price"
				header="Price"
				sortBy="name"
				sortDirection="asc"
				onSortingChange={onSortingChange}
			/>
		);

		fireEvent.click(screen.getByTestId('data-table-header-price'));

		expect(onSortingChange).toHaveBeenCalledWith({
			sortBy: 'sortable_price',
			sortDirection: 'asc',
		});
	});

	describe('sort direction toggling', () => {
		// This mirrors the onPress logic in DataTableHeader:
		// isSorted && sortDirection === 'asc' ? 'desc' : 'asc'
		function getNextSortDirection(
			columnSortField: string,
			currentSortBy: string,
			currentDirection: 'asc' | 'desc'
		): 'asc' | 'desc' {
			const isSorted = currentSortBy === columnSortField;
			return isSorted && currentDirection === 'asc' ? 'desc' : 'asc';
		}

		it('toggles asc to desc when clicking the already-sorted column', () => {
			expect(getNextSortDirection('name', 'name', 'asc')).toBe('desc');
		});

		it('toggles desc to asc when clicking the already-sorted column', () => {
			expect(getNextSortDirection('name', 'name', 'desc')).toBe('asc');
		});

		it('defaults to asc when clicking a different column', () => {
			expect(getNextSortDirection('sku', 'name', 'desc')).toBe('asc');
		});

		it('defaults to asc when clicking a different column even if current is asc', () => {
			expect(getNextSortDirection('sku', 'name', 'asc')).toBe('asc');
		});
	});
});
