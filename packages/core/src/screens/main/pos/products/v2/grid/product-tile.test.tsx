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
		Pressable: jest.requireActual('react').forwardRef(function Pressable(
			{ className, ...props }: React.ComponentProps<typeof actual.Pressable>,
			ref: React.Ref<unknown>
		) {
			return <actual.Pressable {...props} ref={ref} dataSet={{ className }} />;
		}),
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
jest.mock('@wcpos/components/image', () => ({ Image: () => null }));
// The scrim shows what the tile hands it for native's blur beside the words.
jest.mock('@wcpos/components/poster-tile/scrim', () => ({
	Scrim: ({
		children,
		testID,
		blur,
	}: React.PropsWithChildren<{ testID: string; blur?: React.ReactNode }>) => (
		<>
			<div data-testid="scrim-blur-node">{blur}</div>
			<div data-testid={testID}>{children}</div>
		</>
	),
}));
jest.mock('../../../../components/product/price-with-tax', () => ({
	PriceWithTax: ({ price, strikethrough }: { price: string; strikethrough?: boolean }) => (
		<span data-testid="price" data-strike={!!strikethrough}>
			{price}
		</span>
	),
	TaxLine: ({ price }: { price: string }) => <span data-testid="tax">{price}</span>,
}));
jest.mock('../../../../components/data-table/v2/rows', () => ({ DataTableRow: () => null }));
// A picture that fails to load says so, as `TileImage` does before it paints.
let mockImageFails = false;
jest.mock('../../grid/tile-image', () => ({
	TileImage: ({ onFailed }: { onFailed?: () => void }) => {
		jest.requireActual('react').useLayoutEffect(() => {
			if (mockImageFails) onFailed?.();
		}, [onFailed]);
		return <span data-testid="tile-image" />;
	},
	TileImageBlurred: () => <span data-testid="tile-image-blurred" />,
}));
jest.mock('../deal-stack', () => ({
	DealStagedContext: jest.requireActual('react').createContext(null),
}));
jest.mock('../../grid/variable-product-tile', () => ({
	VariableProductTile: ({ record, grow }: { record: { uuid: string }; grow?: boolean }) => (
		<div data-testid="inline-tile" data-grow={String(!!grow)}>
			{record.uuid}
		</div>
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
	['instock', 'bg-card'],
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
	// The number is the whole message; its words are the label.
	expect(pill.textContent).toBe('3');
	expect(pill.getAttribute('aria-label')).toBe('3 left');
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
	expect(screen.getByTestId('product-tile-stock-12').getAttribute('data-class-name')).not.toContain(
		'bg-warning'
	);
	rerender(
		<ProductTile
			record={{ ...record, payload: { ...managed, stock_quantity: 1, low_stock_amount: null } }}
			gridFields={gridFields}
		/>
	);
	expect(screen.getByTestId('product-tile-stock-12').textContent).toBe('1');
	expect(screen.getByTestId('product-tile-stock-12').getAttribute('data-class-name')).not.toContain(
		'bg-warning'
	);
});
it('composes the existing tile under inline and the stacked drill tile under drill', () => {
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
	expect(screen.queryByTestId('poster-stack')).toBeNull();
	rerender(
		<VariableProductTile
			record={{ ...record, remoteId: null }}
			gridFields={gridFields}
			variationsStyle="drill"
			onDrill={onDrill}
		/>
	);
	expect(screen.queryByTestId('inline-tile')).toBeNull();
	// The stack says "tap to deal": two cards behind the square.
	expect(screen.getByTestId('poster-stack').children).toHaveLength(2);
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
	// A browse level stages its product drill, not the record: the drilled tile steps aside too.
	rerender(tile({ kind: 'term', term: { kind: 'all' } }));
	expect(screen.getByTestId('variable-product-tile').style.opacity).toBe('');
	rerender(tile({ kind: 'product', record: { uuid: 'another' } }));
	expect(screen.getByTestId('variable-product-tile').style.opacity).toBe('');
	rerender(tile({ kind: 'product', record: { uuid: 'product' } }));
	expect(screen.getByTestId('variable-product-tile').style.opacity).toBe('0');
});
it('grows to its row in a dealt cell, and shares the row with flex-1 elsewhere', () => {
	const { rerender } = render(<ProductTile record={record} gridFields={gridFields} />);
	const size = () =>
		(screen.getByTestId('product-tile').getAttribute('data-class-name') ?? '').split(' ');
	expect(size()).toContain('flex-1');
	expect(size()).not.toContain('grow');
	rerender(<ProductTile record={record} gridFields={gridFields} grow />);
	expect(size()).toContain('grow');
	expect(size()).not.toContain('flex-1');
	rerender(
		<VariableProductTile
			record={record}
			gridFields={gridFields}
			variationsStyle="drill"
			onDrill={jest.fn()}
			grow
		/>
	);
	expect(
		(screen.getByTestId('variable-product-tile').getAttribute('data-class-name') ?? '').split(' ')
	).toContain('grow');
});
it('hands a dealt cell’s grow to the inline variable tile, and only there', () => {
	const inline = (grow?: boolean) => (
		<VariableProductTile
			record={record}
			gridFields={gridFields}
			variationsStyle="inline"
			onDrill={jest.fn()}
			grow={grow}
		/>
	);
	const { rerender } = render(inline());
	expect(screen.getByTestId('inline-tile').getAttribute('data-grow')).toBe('false');
	rerender(inline(true));
	expect(screen.getByTestId('inline-tile').getAttribute('data-grow')).toBe('true');
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
		['4', 'false'],
		['10', 'true'],
	]);
	expect(screen.getByText('from')).not.toBeNull();
	expect(screen.getByText('Sale')).not.toBeNull();
});

// The words: on the scrim over a picture, straight on the tint without one.
const words = () =>
	(screen.queryByTestId('poster-scrim') ?? screen.getByTestId('poster-words')).textContent;

it('says Sold out in place of the price when out, with no Sale pill, and greys the picture', () => {
	const fields = { ...gridFields, price: true, on_sale: true };
	const payload = { ...record.payload, price: '4', regular_price: '5', on_sale: true };
	const { rerender } = render(
		<ProductTile
			record={{ ...record, payload: { ...payload, stock_status: 'instock' } }}
			gridFields={fields}
		/>
	);
	expect(screen.queryByText('Sold out')).toBeNull();
	expect(screen.getByTestId('poster-picture').getAttribute('data-class-name')).not.toContain(
		'opacity-40'
	);
	rerender(
		<ProductTile
			record={{ ...record, payload: { ...payload, stock_status: 'outofstock' } }}
			gridFields={fields}
		/>
	);
	expect(screen.getByText('Sold out')).not.toBeNull();
	expect(screen.queryByTestId('price')).toBeNull();
	expect(screen.queryByText('Sale')).toBeNull();
	expect(screen.getByTestId('poster-picture').getAttribute('data-class-name')).toContain(
		'opacity-40'
	);
});

it('shows the Sale pill and the struck price only when on sale and the field is on', () => {
	const sale = {
		...record,
		payload: { ...record.payload, price: '4', regular_price: '5', on_sale: true },
	};
	const { rerender } = render(
		<ProductTile record={sale} gridFields={{ ...gridFields, price: true, on_sale: false }} />
	);
	expect(screen.getAllByTestId('price').map((node) => node.textContent)).toEqual(['4']);
	expect(screen.queryByText('Sale')).toBeNull();
	rerender(
		<ProductTile record={sale} gridFields={{ ...gridFields, price: true, on_sale: true }} />
	);
	expect(screen.getAllByTestId('price').map((node) => node.textContent)).toEqual(['4', '5']);
	expect(screen.getByText('Sale')).not.toBeNull();
	rerender(
		<ProductTile
			record={{ ...sale, payload: { ...sale.payload, on_sale: false } }}
			gridFields={{ ...gridFields, price: true, on_sale: true }}
		/>
	);
	expect(screen.queryByText('Sale')).toBeNull();
});

it('lays the facts out Cost, SKU, barcode, categories, each only when on and set', () => {
	const full = {
		...record,
		payload: {
			...record.payload,
			sku: 'T1',
			barcode: '123',
			categories: [{ id: 3, name: 'Hot' }, { name: 'Drinks' }],
			cost_of_goods_sold: { total_value: 9 },
		},
	};
	const all = { ...gridFields, sku: true, barcode: true, category: true, cost_of_goods_sold: true };
	const { rerender } = render(<ProductTile record={full} gridFields={all} />);
	expect(words()).toBe('TeaCost 9SKU T1123Hot, Drinks');
	rerender(<ProductTile record={full} gridFields={{ ...all, sku: false, category: false }} />);
	expect(words()).toBe('TeaCost 9123');
	rerender(
		<ProductTile record={{ ...full, payload: { ...full.payload, barcode: '' } }} gridFields={all} />
	);
	expect(words()).toBe('TeaCost 9SKU T1Hot, Drinks');
});

it('draws no scrim when every field it would show is off', () => {
	render(<ProductTile record={record} gridFields={{ ...gridFields, name: false }} />);
	expect(screen.queryByTestId('poster-scrim')).toBeNull();
	expect(screen.queryByTestId('poster-words')).toBeNull();
});

it('counts a drill tile’s options, and stacks only a drill tile', () => {
	const variable = { ...record, payload: { ...record.payload, variations: [1, 2, 3] } };
	const { rerender } = render(<ProductTile record={variable} gridFields={gridFields} />);
	expect(screen.queryByTestId('poster-stack')).toBeNull();
	expect(screen.queryByText('3 options')).toBeNull();
	rerender(<ProductTile record={variable} gridFields={gridFields} onDrill={jest.fn()} />);
	expect(screen.getByTestId('poster-stack')).not.toBeNull();
	expect(screen.getByText('3 options')).not.toBeNull();
	// The stack has no stock of its own.
	expect(screen.queryByTestId('product-tile-stock-12')).toBeNull();
});

it('hands the scrim a blurred twin of its picture for native, and none on a tint', () => {
	const pictured = { ...record, payload: { ...record.payload, images: [{ src: 'tea.jpg' }] } };
	const { rerender } = render(<ProductTile record={pictured} gridFields={gridFields} />);
	expect(screen.getByTestId('tile-image')).toBeTruthy();
	const twin = screen.getByTestId('scrim-blur-node');
	expect(twin.querySelector('[data-testid="tile-image-blurred"]')).not.toBeNull();
	// Not inside the square: it belongs to the scrim.
	expect(screen.getByTestId('poster-picture').contains(twin)).toBe(false);
	rerender(<ProductTile record={record} gridFields={gridFields} />);
	expect(screen.queryByTestId('tile-image-blurred')).toBeNull();
});

it('falls back to the tint of its first category, or its name, when the picture fails', () => {
	// The tint is the whole card, square and band.
	const square = () => screen.getByTestId('poster-card').getAttribute('data-class-name');
	const pictured = { ...record, payload: { ...record.payload, images: [{ src: 'tea.jpg' }] } };
	mockImageFails = false;
	const first = render(<ProductTile record={pictured} gridFields={gridFields} />);
	expect(screen.getByTestId('tile-image')).not.toBeNull();
	expect(square()).not.toContain('bg-tile-tint');
	first.unmount();
	mockImageFails = true;
	const { rerender } = render(<ProductTile record={pictured} gridFields={gridFields} />);
	expect(screen.queryByTestId('tile-image')).toBeNull();
	// T 84 + e 101 + a 97 = 282, and 282 % 6 = 0.
	expect(square()).toContain('bg-tile-tint-0');
	mockImageFails = false;
	// No picture at all: the tint at once, keyed by the first category's id.
	rerender(
		<ProductTile
			record={{ ...record, payload: { ...record.payload, categories: [{ id: 15 }] } }}
			gridFields={gridFields}
		/>
	);
	expect(square()).toContain('bg-tile-tint-3');
});

it('omits a variable range the server did not send, never printing the parent’s cleared price', () => {
	const ranges = (value: object) => ({
		...record,
		payload: {
			...record.payload,
			price: '',
			regular_price: '',
			on_sale: true,
			meta_data: [{ key: '_woocommerce_pos_variable_prices', value: JSON.stringify(value) }],
		},
	});
	const fields = { ...gridFields, price: true, on_sale: true };
	const { rerender } = render(
		<ProductTile
			record={ranges({ regular_price: { min: '10', max: '12' } })}
			gridFields={fields}
			onDrill={jest.fn()}
		/>
	);
	// No price sub-range: only the struck regular price, nothing at 0.
	expect(
		screen
			.getAllByTestId('price')
			.map((node) => [node.textContent, node.getAttribute('data-strike')])
	).toEqual([['10', 'true']]);
	rerender(
		<ProductTile
			record={ranges({ sale_price: { min: '8', max: '8' } })}
			gridFields={fields}
			onDrill={jest.fn()}
		/>
	);
	expect(screen.queryByTestId('price')).toBeNull();
	expect(screen.queryByText('Sale')).toBeNull();
});
