/** @jest-environment jsdom */
import * as React from 'react';

import { act, render as renderTree, screen } from '@testing-library/react';

import { mockCategories, mockProducts, setOrders } from './test-utils';
import { LocalProductsContext, useLocalProducts } from './use-local-products';
import { CategoriesCard } from './categories';

import type { ReportOrder } from '../context';
function Wrapper({ children }: React.PropsWithChildren) {
	const products = useLocalProducts([1]);
	return <LocalProductsContext.Provider value={products}>{children}</LocalProductsContext.Provider>;
}
const render = (element: React.ReactElement) => renderTree(element, { wrapper: Wrapper });
beforeEach(() => {
	mockCategories.next([]);
	setOrders([
		{ total: '12', line_items: [{ product_id: 1, total: '12', quantity: 1.5 }] },
	] as ReportOrder[]);
});
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
it('groups a sub-category under its top-level parent in the card', () => {
	mockProducts.next([{ id: 1, categories: [{ id: 2, name: 'Beans' }] }]);
	mockCategories.next([
		{ id: 1, name: 'Coffee', parent: 0 },
		{ id: 2, name: 'Beans', parent: 1 },
	]);
	render(<CategoriesCard />);
	expect(screen.getByTestId('card-categories-donut-row-1').textContent).toContain('Coffee');
	expect(screen.queryByTestId('card-categories-donut-row-2')).toBeNull();
});
it('shows the skeleton until the categories emit', () => {
	mockProducts.next([{ id: 1, categories: [{ id: 2, name: 'Beans' }] }]);
	mockCategories.next(undefined);
	render(<CategoriesCard />);
	expect(screen.getByTestId('card-categories-loading')).toBeTruthy();
	act(() => mockCategories.next([{ id: 2, name: 'Beans', parent: 0 }]));
	expect(screen.queryByTestId('card-categories-loading')).toBeNull();
});
