/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { ProductName } from './product-name';

jest.mock('@wcpos/components/hstack', () => ({ HStack: jest.requireActual('react-native').View }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: jest.requireActual('react-native').View }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({
		children,
		decodeHtml,
		className,
		...props
	}: React.PropsWithChildren<{ decodeHtml?: boolean; className?: string }>) => {
		const { Text } = jest.requireActual('react-native');
		const { decode } = jest.requireActual('html-entities');
		return (
			<Text {...props} dataSet={{ classname: className }}>
				{decodeHtml && typeof children === 'string' ? decode(children) : children}
			</Text>
		);
	},
}));

jest.mock('../../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-1' } }),
}));
jest.mock('../../../hooks/use-update-line-item', () => ({
	useUpdateLineItem: () => ({ updateLineItem: jest.fn() }),
}));
jest.mock('../../../hooks/stock-rejection', () => ({
	stockRejection$: new (jest.requireActual('rxjs').BehaviorSubject)(null),
	getStockRejectionForLine: () => null,
}));
jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string, params?: Record<string, unknown>) =>
		params ? `${key} ${JSON.stringify(params)}` : key,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: ({ name }: { name: string }) => `[${name}]` }));
let mockUnmet: { lineUuid: string; available: number | null }[] = [];
jest.mock('../../../conditions/use-cart-conditions', () => ({ useCartUnmet: () => mockUnmet }));
jest.mock('../../../../components/editable-field', () => ({ EditableField: () => null }));

it('joins public metadata into a decoded subline while keeping value-only selectors', () => {
	const props = {
		row: {
			original: {
				uuid: 'line-1',
				type: 'line_items',
				item: {
					name: 'Shirt',
					meta_data: [
						{ key: '_private', value: 'hidden' },
						{
							key: 'colour',
							value: 'natural',
							display_key: 'Colour',
							display_value: 'Natural &amp; cream',
						},
						{ key: 'Size', value: 'L' },
					],
				},
			},
		},
		column: { columnDef: { meta: { show: () => false } } },
		table: { options: { data: [] } },
	} as unknown as React.ComponentProps<typeof ProductName>;
	render(<ProductName {...props} />);
	const colour = screen.getByTestId('cart-line-meta-Colour');
	const size = screen.getByTestId('cart-line-meta-Size');
	expect(screen.getByTestId('cart-line-meta').textContent).toContain('Size: L');
	expect(colour.textContent).toBe('Natural & cream');
	expect(size.textContent).toBe('L');
	expect(colour.parentElement).toBe(size.parentElement);
	expect(colour.parentElement?.textContent).toBe('Colour: Natural & cream · Size: L');
	expect(screen.queryByTestId('cart-line-meta-_private')).toBeNull();
});

describe('the stock mark (roadmap#62)', () => {
	const props = (uuid: string) =>
		({
			row: { original: { uuid, type: 'line_items', item: { name: 'Belt', meta_data: [] } } },
			column: { columnDef: { meta: { show: () => false } } },
			table: { options: { data: [] } },
		}) as unknown as React.ComponentProps<typeof ProductName>;
	afterEach(() => {
		mockUnmet = [];
	});

	it('marks a line the cart judges over stock in the attention colour, with icon and words', () => {
		mockUnmet = [{ lineUuid: 'line-1', available: 2 }];
		render(<ProductName {...props('line-1')} />);
		const mark = screen.getByTestId('cart-line-stock-mark');
		expect(mark.textContent).toBe('[box]pos_cart.n_available {"quantity":2}');
		expect(mark.innerHTML).toContain('text-attention');
		expect(mark.innerHTML).not.toContain('text-destructive');
	});

	it('says out of stock when nothing is known, and marks no other line', () => {
		mockUnmet = [{ lineUuid: 'line-1', available: null }];
		render(<ProductName {...props('line-1')} />);
		expect(screen.getByTestId('cart-line-stock-mark').textContent).toBe('[box]common.out_of_stock');
		render(<ProductName {...props('line-2')} />);
		expect(screen.getAllByTestId('cart-line-stock-mark')).toHaveLength(1);
	});
});
