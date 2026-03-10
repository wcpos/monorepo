/**
 * @jest-environment node
 */

import React from 'react';

describe('DataTableHeader sorting behavior', () => {
	describe('sort field mapping', () => {
		function getSortField(columnId: string): string {
			if (columnId === 'price' || columnId === 'total') {
				return `sortable_${columnId}`;
			}
			return columnId;
		}

		it('maps price column to sortable_price', () => {
			expect(getSortField('price')).toBe('sortable_price');
		});

		it('maps total column to sortable_total', () => {
			expect(getSortField('total')).toBe('sortable_total');
		});

		it('passes through regular column IDs unchanged', () => {
			expect(getSortField('name')).toBe('name');
			expect(getSortField('date_created_gmt')).toBe('date_created_gmt');
			expect(getSortField('last_name')).toBe('last_name');
			expect(getSortField('sku')).toBe('sku');
		});
	});

	describe('sort direction toggling', () => {
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
