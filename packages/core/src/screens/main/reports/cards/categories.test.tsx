/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { mockProducts, setOrders } from './test-utils';
import { CategoriesCard } from './categories';

import type { ReportOrder } from '../context';
beforeEach(() =>
	setOrders([
		{ total: '12', line_items: [{ product_id: 1, total: '12', quantity: 1.5 }] },
	] as ReportOrder[])
);
it('shows the skeleton until the products emit', () => {
	mockProducts.next(undefined);
	render(<CategoriesCard />);
	expect(screen.getByTestId('card-categories-loading')).toBeTruthy();
	act(() => mockProducts.next([{ id: 1, categories: [{ id: 2, name: 'Food' }] }]));
	expect(screen.queryByTestId('card-categories-loading')).toBeNull();
	expect(screen.getByTestId('card-categories-donut-row-2').textContent).toContain('1.5 sold');
});
it('names the lines without a local product', () => {
	mockProducts.next([]);
	render(<CategoriesCard />);
	expect(screen.getByTestId('card-categories-unknown').textContent).toBe(
		'1 of 1 lines have no local product'
	);
	expect(screen.getByTestId('card-categories-donut-row-unknown').textContent).toContain(
		'Unknown product'
	);
});
