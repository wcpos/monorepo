/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DealStagedContext } from '../deal-stack';
import { ProductTile } from './product-tile';
import { VariableProductTile } from './variable-product-tile';

jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		View: ({ className, ...props }: React.ComponentProps<typeof actual.View>) => (
			<actual.View {...props} dataSet={{ className }} />
		),
	};
});

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
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual('react-native').View },
	ReduceMotion: { System: 'system' },
	Easing: { bezier: () => 'ease' },
	useAnimatedStyle: () => ({}),
	useSharedValue: (value: number) => ({ value }),
	withSequence: (value: number) => value,
	withSpring: (value: number) => value,
	withTiming: (value: number) => value,
}));
jest.mock('../../../hooks/use-add-product', () => ({ useAddProduct: () => ({ addProduct }) }));
jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../../jest/translate').createTestT(),
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
jest.mock('../deal-stack', () => ({
	DealStagedContext: jest.requireActual('react').createContext(null),
}));
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
	expect(screen.getByLabelText('In cart: 2').textContent).toBe('2');
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
it.each([
	['instock', 'bg-foreground'],
	['lowstock', 'bg-warning'],
] as const)('shows managed quantity in a %s pill', (stockStatus, color) => {
	render(
		<ProductTile
			record={{
				...record,
				payload: {
					...record.payload,
					manage_stock: true,
					stock_quantity: 3,
					stock_status: stockStatus,
				},
			}}
			gridFields={gridFields}
		/>
	);
	const pill = screen.getByTestId('product-tile-stock-12');
	expect(pill.textContent).toBe('3 left');
	expect(pill.getAttribute('data-class-name')).toContain(color);
});
it('reads low stock from the product threshold, since Woo has no lowstock status', () => {
	const managed = { ...record.payload, manage_stock: true, stock_status: 'instock' as const };
	const { rerender } = render(
		<ProductTile
			record={{ ...record, payload: { ...managed, stock_quantity: 2, low_stock_amount: 5 } }}
			gridFields={gridFields}
		/>
	);
	expect(screen.getByTestId('product-tile-stock-12').getAttribute('data-class-name')).toContain(
		'bg-warning'
	);
	rerender(
		<ProductTile
			record={{ ...record, payload: { ...managed, stock_quantity: 6, low_stock_amount: 5 } }}
			gridFields={gridFields}
		/>
	);
	expect(screen.getByTestId('product-tile-stock-12').getAttribute('data-class-name')).toContain(
		'bg-foreground'
	);
	rerender(
		<ProductTile
			record={{ ...record, payload: { ...managed, stock_quantity: 1, low_stock_amount: null } }}
			gridFields={gridFields}
		/>
	);
	expect(screen.getByTestId('product-tile-stock-12').textContent).toBe('1 left');
	expect(screen.getByTestId('product-tile-stock-12').getAttribute('data-class-name')).toContain(
		'bg-foreground'
	);
	expect(screen.queryByTestId('stock')).toBeNull();
});
it('composes the existing tile under inline and the drill tile with a chevron under drill', () => {
	const onDrill = jest.fn();
	const { rerender } = render(
		<VariableProductTile
			record={{ ...record, remoteId: null }}
			gridFields={gridFields}
			variationsStyle="inline"
			onDrill={onDrill}
		/>
	);
	expect(screen.getByTestId('inline-tile').textContent).toBe('product');
	expect(screen.queryByTestId('chevronRight')).toBeNull();
	rerender(
		<VariableProductTile
			record={{ ...record, remoteId: null }}
			gridFields={gridFields}
			variationsStyle="drill"
			onDrill={onDrill}
		/>
	);
	expect(screen.queryByTestId('inline-tile')).toBeNull();
	expect(screen.getByTestId('chevronRight')).not.toBeNull();
	expect(screen.getByTestId('variable-product-tile-product')).not.toBeNull();
	fireEvent.click(screen.getByTestId('variable-product-tile'));
	// The tile hands itself over with the record: the deal starts from where it sits.
	expect(onDrill).toHaveBeenCalledWith({ ...record, remoteId: null }, expect.anything());
});
it('steps aside while its copy is out on the stage, and only then', () => {
	const tile = (staged: object | null) => (
		<DealStagedContext.Provider value={staged}>
			<VariableProductTile
				record={record}
				gridFields={gridFields}
				variationsStyle="drill"
				onDrill={jest.fn()}
			/>
		</DealStagedContext.Provider>
	);
	const { rerender } = render(tile(null));
	expect(screen.getByTestId('variable-product-tile').style.opacity).toBe('');
	rerender(tile({ uuid: 'another' }));
	expect(screen.getByTestId('variable-product-tile').style.opacity).toBe('');
	rerender(tile({ uuid: 'product' }));
	expect(screen.getByTestId('variable-product-tile').style.opacity).toBe('0');
});

it('shows the minimum variable price with from and keeps sale strikethrough', () => {
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
	]);
	expect(screen.getByText('from')).not.toBeNull();
	expect(screen.queryByTestId('chevronRight')).toBeNull();
});
