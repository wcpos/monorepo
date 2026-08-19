/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { StockStatus } from './stock-status';

const mockButtonPill = jest.fn();

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: { payload: unknown }, select: (value: unknown) => unknown) =>
		select(record),
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonPill: (props: Record<string, unknown>) => {
		mockButtonPill(props);
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
	return { setFilter, props: mockButtonPill.mock.calls.at(-1)?.[0] };
}

afterEach(() => mockButtonPill.mockReset());

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
		expect(props.variant).toBe('ghost-destructive');
		expect(props.children).toBe('outofstock');
	});

	it('shows the server flag verbatim when stock is not managed', () => {
		const { props } = renderCell({
			manage_stock: false,
			stock_quantity: 0,
			stock_status: 'lowstock',
		});
		expect(props.variant).toBe('ghost-warning');
		expect(props.children).toBe('lowstock');
	});

	it('filters by the displayed status on press', () => {
		const { props, setFilter } = renderCell({
			manage_stock: true,
			stock_quantity: 5,
			stock_status: 'outofstock',
		});
		(props.onPress as () => void)();
		expect(setFilter).toHaveBeenCalledWith('stock_status', 'instock');
	});
});
