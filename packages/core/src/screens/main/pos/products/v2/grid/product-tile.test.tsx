/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ProductTile } from './product-tile';
import { VariableProductTile } from './variable-product-tile';

const addProduct = jest.fn();
const order = {
	payload: { line_items: [{ product_id: 12 }, { product_id: 12 }, { product_id: 99 }] },
};
jest.mock('@wcpos/query', () => ({
	useDocField: (record: object, select: (value: object) => unknown) => select(record),
}));
jest.mock('../../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: order }),
}));
jest.mock('../../../hooks/use-add-product', () => ({ useAddProduct: () => ({ addProduct }) }));
jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: { count: number }) =>
		values ? `${key}: ${values.count}` : key,
}));
jest.mock('../../../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({ getLabel: (value: string) => value }),
}));
jest.mock('../../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={name} />,
}));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label, variant }: { label: string; variant: string }) => (
		<span data-testid="stock" data-variant={variant}>
			{label}
		</span>
	),
}));
jest.mock('../../../../components/product/price-with-tax', () => ({
	PriceWithTax: ({ price, strikethrough }: { price: string; strikethrough?: boolean }) => (
		<span data-testid="price" data-strike={!!strikethrough}>
			{price}
		</span>
	),
}));
jest.mock('../../../../components/data-table/v2/rows', () => ({ DataTableRow: () => null }));
jest.mock('../../grid/tile-image', () => ({ TileImage: () => null }));
jest.mock('../../grid/variable-product-tile', () => ({
	VariableProductTile: ({ record }: { record: { uuid: string } }) => (
		<div data-testid="inline-tile">{record.uuid}</div>
	),
}));
const record = {
	uuid: 'product',
	remoteId: 12,
	payload: { name: 'Tea', stock_status: 'lowstock' },
} as unknown as React.ComponentProps<typeof ProductTile>['record'];
const gridFields = {
	name: true,
	price: false,
	tax: false,
	on_sale: false,
	category: false,
	sku: false,
	barcode: false,
	stock_quantity: true,
	cost_of_goods_sold: false,
};
it('shows the in-cart line count and adds through the existing hook', () => {
	render(<ProductTile record={record} gridFields={gridFields} />);
	expect(screen.getByLabelText('pos_products.in_cart_count: 2').textContent).toBe('2');
	fireEvent.click(screen.getByTestId('product-tile'));
	expect(addProduct).toHaveBeenCalledWith(record);
});
it.each([
	['lowstock', 'warning'],
	['outofstock', 'error'],
	['onbackorder', 'success'],
] as const)('maps %s to %s', (stock, variant) => {
	render(
		<ProductTile
			record={{ ...record, payload: { ...record.payload, stock_status: stock } }}
			gridFields={gridFields}
		/>
	);
	expect(screen.getByTestId('stock').getAttribute('data-variant')).toBe(variant);
});
it('composes the existing tile under inline and the drill tile with a chevron under drill', () => {
	const onDrill = jest.fn();
	const { rerender } = render(
		<VariableProductTile
			record={record}
			gridFields={gridFields}
			variationsStyle="inline"
			onDrill={onDrill}
		/>
	);
	expect(screen.getByTestId('inline-tile').textContent).toBe('product');
	expect(screen.queryByTestId('chevronRight')).toBeNull();
	rerender(
		<VariableProductTile
			record={record}
			gridFields={gridFields}
			variationsStyle="drill"
			onDrill={onDrill}
		/>
	);
	expect(screen.queryByTestId('inline-tile')).toBeNull();
	expect(screen.getByTestId('chevronRight')).not.toBeNull();
	expect(screen.getByTestId('variable-product-tile-12')).not.toBeNull();
	fireEvent.click(screen.getByTestId('variable-product-tile'));
	expect(onDrill).toHaveBeenCalledWith(record);
});

it('keeps variable price ranges and sale ranges on a drill tile', () => {
	const variable = {
		...record,
		payload: {
			...record.payload,
			on_sale: true,
			meta_data: [
				{
					key: '_woocommerce_pos_variable_prices',
					value: JSON.stringify({
						price: { min: '4', max: '8' },
						regular_price: { min: '10', max: '10' },
					}),
				},
			],
		},
	};
	render(
		<VariableProductTile
			record={variable}
			gridFields={{ ...gridFields, price: true, on_sale: true }}
			variationsStyle="drill"
			onDrill={jest.fn()}
		/>
	);
	expect(
		screen
			.getAllByTestId('price')
			.map((node) => [node.textContent, node.getAttribute('data-strike')])
	).toEqual([
		['10', 'true'],
		['4', 'false'],
		['8', 'false'],
	]);
});
