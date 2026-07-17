/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { cleanup, render, screen } from '@testing-library/react';

import { ProductName } from '../cart/cells/product-name';
import {
	clearStockRejection,
	parseInsufficientStockError,
	setStockRejection,
	stockRejection$,
} from './stock-rejection';

const mockCurrentOrder: { uuid: string; line_items: Record<string, unknown>[] } = {
	uuid: 'order-1',
	line_items: [],
};

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrder: mockCurrentOrder }),
}));

jest.mock('./use-update-line-item', () => ({
	useUpdateLineItem: () => ({ updateLineItem: jest.fn() }),
}));

jest.mock('../../components/editable-field', () => ({
	EditableField: () => null,
}));

jest.mock('../cart/cells/edit-cart-item-button', () => ({
	EditCartItemButton: () => null,
}));

jest.mock('../cart/cells/edit-line-item', () => ({ EditLineItem: () => null }));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) =>
		React.createElement('span', null, children),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		values ? `${key}:${String(values.quantity ?? '')}` : key,
}));

function renderProductName(item: Record<string, unknown>) {
	return render(
		React.createElement(ProductName, {
			row: { original: { item, uuid: 'line-1' } } as never,
			column: { columnDef: { meta: { show: () => false } } } as never,
		} as never)
	);
}

describe('parseInsufficientStockError', () => {
	const items = [
		{ product_id: 12, variation_id: 34, name: 'Hoodie – Blue, M', requested: 5, available: 3 },
	];

	it('extracts items from an axios-shaped rejection', () => {
		const error = {
			response: {
				data: { code: 'wcpos_insufficient_stock', message: 'x', data: { status: 400, items } },
			},
		};
		expect(parseInsufficientStockError(error)).toEqual(items);
	});

	it('accepts a bare WP_Error body', () => {
		const body = { code: 'wcpos_insufficient_stock', data: { items } };
		expect(parseInsufficientStockError(body)).toEqual(items);
	});

	it('returns null for other error codes, malformed bodies, and non-objects', () => {
		expect(
			parseInsufficientStockError({ response: { data: { code: 'wcpos_invalid_tendered_amount' } } })
		).toBeNull();
		expect(parseInsufficientStockError({ code: 'wcpos_insufficient_stock' })).toBeNull();
		expect(parseInsufficientStockError(new Error('network'))).toBeNull();
		expect(parseInsufficientStockError(null)).toBeNull();
	});

	it('drops malformed item rows', () => {
		const body = {
			code: 'wcpos_insufficient_stock',
			data: { items: [items[0], null, { name: 'no ids' }] },
		};
		expect(parseInsufficientStockError(body)).toEqual(items);
	});
});

describe('stockRejection$', () => {
	it('sets and clears the shared rejection state', () => {
		setStockRejection({ orderUuid: 'abc', items: [] });
		expect(stockRejection$.getValue()).toEqual({ orderUuid: 'abc', items: [] });
		clearStockRejection();
		expect(stockRejection$.getValue()).toBeNull();
	});
});

describe('ProductName stock rejection highlight', () => {
	afterEach(() => {
		cleanup();
		clearStockRejection();
		mockCurrentOrder.uuid = 'order-1';
		mockCurrentOrder.line_items = [];
	});

	it('ignores a rejection from another order', () => {
		mockCurrentOrder.uuid = 'order-2';
		mockCurrentOrder.line_items = [{ product_id: 10, variation_id: 0, quantity: 4 }];
		setStockRejection({
			orderUuid: 'order-1',
			items: [{ product_id: 10, variation_id: 0, available: 3 }],
		});

		renderProductName(mockCurrentOrder.line_items[0]);

		expect(screen.queryByText('pos_cart.n_available:3')).toBeNull();
	});

	it('keeps sibling variation highlights until their aggregate is valid', () => {
		mockCurrentOrder.line_items = [
			{ product_id: 10, variation_id: 101, quantity: 2 },
			{ product_id: 10, variation_id: 102, quantity: 2 },
		];
		setStockRejection({
			orderUuid: 'order-1',
			items: [
				{
					product_id: 10,
					variation_id: 101,
					available: 3,
					reason: 'insufficient_stock',
				},
				{
					product_id: 10,
					variation_id: 102,
					available: 3,
					reason: 'insufficient_stock',
				},
			],
		});

		renderProductName(mockCurrentOrder.line_items[0]);

		expect(screen.getByText('pos_cart.n_available:3')).toBeTruthy();
	});
});
