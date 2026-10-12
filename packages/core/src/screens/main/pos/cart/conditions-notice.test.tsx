/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { CartConditionsNotice } from './conditions-notice';

import type { UnmetCondition } from '../conditions/evaluate';

let mockUnmet: UnmetCondition[] = [];
const mockOpenLineQuantity = jest.fn();
const mockRemoveLineItem = jest.fn(async () => undefined);
jest.mock('../conditions/use-cart-conditions', () => ({
	useCartUnmet: () => mockUnmet,
	openLineQuantity: (uuid: string) => mockOpenLineQuantity(uuid),
}));
jest.mock('../hooks/use-remove-line-item', () => ({
	useRemoveLineItem: () => ({ removeLineItem: mockRemoveLineItem }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, params?: Record<string, unknown>) =>
		params ? `${key} ${JSON.stringify(params)}` : key,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: ({ name }: { name: string }) => `[${name}]` }));
jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});

const belt: UnmetCondition = {
	id: 'stock',
	reasonKey: 'pos_cart.only_n_available',
	params: { quantity: 2, name: 'Belt' },
	lineUuid: 'belt',
	fix: 'reduce',
	available: 2,
};
const beanie: UnmetCondition = {
	id: 'stock',
	reasonKey: 'pos_products.out_of_stock',
	params: { name: 'Beanie' },
	lineUuid: 'beanie',
	fix: 'remove',
	available: null,
};

beforeEach(() => {
	jest.clearAllMocks();
	mockUnmet = [];
});

it('renders nothing while every condition is met', () => {
	const { container } = render(<CartConditionsNotice />);
	expect(container.innerHTML).toBe('');
});

it('one row per unmet line: icon, message, verb at the edge', () => {
	mockUnmet = [belt, beanie, { ...beanie, lineUuid: 'scarf', params: { name: 'Scarf' } }];
	render(<CartConditionsNotice />);
	expect(screen.getByTestId('cart-conditions-notice')).toBeTruthy();
	const rows = screen.getAllByTestId('cart-condition-row');
	expect(rows.map((row) => row.textContent)).toEqual([
		'[box]pos_cart.only_n_available {"quantity":2,"name":"Belt"}pos_cart.reduce_line[chevronRight]',
		'[box]pos_cart.out_of_stock_for {"name":"Beanie"}pos_cart.remove_line[chevronRight]',
		'[box]pos_cart.out_of_stock_for {"name":"Scarf"}pos_cart.remove_line[chevronRight]',
	]);
});

it('Reduce opens the line’s quantity keypad and writes nothing', () => {
	mockUnmet = [belt, beanie];
	render(<CartConditionsNotice />);
	fireEvent.click(screen.getAllByTestId('cart-condition-row')[0]);
	expect(mockOpenLineQuantity).toHaveBeenCalledWith('belt');
	expect(mockRemoveLineItem).not.toHaveBeenCalled();
});

it('Remove takes the line out through the strip’s writer', () => {
	mockUnmet = [belt, beanie];
	render(<CartConditionsNotice />);
	fireEvent.click(screen.getAllByTestId('cart-condition-row')[1]);
	expect(mockRemoveLineItem).toHaveBeenCalledWith('beanie', 'line_items');
	expect(mockOpenLineQuantity).not.toHaveBeenCalled();
});
