/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { StockStatus } from './stock-status';

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/button', () => ({ ButtonPill: () => null }));

const mockStatusBadge = jest.fn();

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: { payload: unknown }, select: (value: unknown) => unknown) =>
		select(record),
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: (props: Record<string, unknown>) => {
		mockStatusBadge(props);
		return null;
	},
}));
jest.mock('../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({ getLabel: (status: string) => status }),
}));

function renderCell(product: Record<string, unknown>) {
	const setFilter = jest.fn();
	render(
		<StockStatus
			row={{ original: { document: product, record: { payload: product } } } as never}
			table={{ options: { meta: { actions: { setFilter } } } } as never}
			column={{} as never}
			cell={{} as never}
			getValue={jest.fn()}
			renderValue={jest.fn()}
		/>
	);
	return { setFilter, props: mockStatusBadge.mock.calls.at(-1)?.[0] };
}

afterEach(() => mockStatusBadge.mockReset());

describe('StockStatus cell', () => {
	it('tracks a local quantity edit instead of the stale server flag', () => {
		// The optimistic patch writes stock_quantity only; payload.stock_status
		// stays 'instock' until the push acks. The badge must not wait for it.
		const { props } = renderCell({
			manage_stock: true,
			stock_quantity: -3,
			stock_status: 'instock',
			backorders: 'no',
		});
		expect(props.variant).toBe('error');
		expect(props.label).toBe('outofstock');
	});

	it('shows the server flag verbatim when stock is not managed', () => {
		const { props } = renderCell({
			manage_stock: false,
			stock_quantity: 0,
			stock_status: 'lowstock',
		});
		expect(props.variant).toBe('warning');
		expect(props.label).toBe('lowstock');
	});

	it('filters by the displayed status on press', () => {
		const { setFilter } = renderCell({
			manage_stock: true,
			stock_quantity: 5,
			stock_status: 'outofstock',
		});
		fireEvent.click(screen.getByTestId('product-stock-status'));
		expect(setFilter).toHaveBeenCalledWith('stock_status', 'instock');
	});
});

it.each([
	['instock', 'success'],
	['lowstock', 'warning'],
	['onbackorder', 'warning'],
	['outofstock', 'error'],
	['unknown', 'default'],
])('maps %s to %s', (stock_status, variant) => {
	const { props } = renderCell({ manage_stock: false, stock_status });
	expect(props.variant).toBe(variant);
});
