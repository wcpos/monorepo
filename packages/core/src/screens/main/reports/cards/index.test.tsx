/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { mockState, setOrders } from './test-utils';
import { PeriodSection } from './index';
import { DateButton } from '../date-button';

beforeEach(() => {
	setOrders([]);
	mockState.screenSize = 'lg';
	mockState.from = mockState.to = '2026-07-15';
});
// Reordering or omitting a card, diverging labels and incorrect width buckets break these contracts.
it('renders Orders, Top products, Taxes and Refunds in that order', () => {
	render(<PeriodSection />);
	const section = screen.getByTestId('reports-period-section');
	expect(
		Array.from(section.querySelectorAll('[data-testid]'))
			.map((node) => node.getAttribute('data-testid'))
			.filter((id) => /^card-(orders|products|taxes|refunds)$/.test(id!))
	).toEqual(['card-orders', 'card-products', 'card-taxes', 'card-refunds']);
});
it("the heading reads the date button's label", () => {
	const tree = () => (
		<>
			<DateButton
				scope={{ from: mockState.from, to: mockState.to, registerId: '' }}
				onScopeChange={() => {}}
				lockedScopeName=""
			/>
			<PeriodSection />
		</>
	);
	const view = render(tree());
	for (const [from, to, expected] of [
		['2026-07-15', '2026-07-15', 'Today'],
		['2026-07-14', '2026-07-14', 'Yesterday'],
		['2026-07-02', '2026-07-09', '2–9 Jul'],
	]) {
		mockState.from = from;
		mockState.to = to;
		view.rerender(tree());
		expect(screen.getByTestId('reports-period-title').textContent).toBe(
			screen.getByTestId('reports-period').textContent
		);
		expect(screen.getByTestId('reports-period-title').textContent).toContain(expected);
	}
});
it('three columns on lg, two on md, one on sm', () => {
	const view = render(<PeriodSection />);
	for (const [size, columns] of [
		['lg', 3],
		['md', 2],
		['sm', 1],
	] as const) {
		mockState.screenSize = size;
		view.rerender(<PeriodSection />);
		const row = screen.getByTestId('card-orders').parentElement!.parentElement!;
		expect(row.children.length).toBe(columns);
		expect(row.parentElement!.children.length).toBe(1 + Math.ceil(4 / columns));
		expect(row.children[0].contains(screen.getByTestId('card-orders'))).toBe(true);
	}
});
it("an empty period shows the cards' empty lines and the three tax figures", () => {
	render(<PeriodSection />);
	expect(screen.getByTestId('card-orders-empty').textContent).toBe('No orders in this period');
	expect(screen.getByTestId('card-products-empty').textContent).toBe('No sales in this period');
	expect(screen.getByTestId('card-refunds-none').textContent).toBe('None in this period');
	for (const id of ['net', 'tax', 'gross'])
		expect(screen.getByTestId(`card-taxes-${id}`).textContent).toBe('£0.00');
});
it('shows skeletons while the viewed store is unknown', () => {
	const store = mockState.store;
	mockState.store = undefined;
	try {
		render(<PeriodSection />);
		expect(screen.getByTestId('reports-period-title').textContent).toContain('Today');
		for (const id of ['orders', 'products', 'taxes', 'refunds']) {
			expect(screen.getByTestId(`card-${id}-loading`).querySelectorAll('[aria-busy]')).toHaveLength(
				2
			);
			expect(screen.queryByTestId(`card-${id}-figure`)).toBeNull();
		}
	} finally {
		mockState.store = store;
	}
});
