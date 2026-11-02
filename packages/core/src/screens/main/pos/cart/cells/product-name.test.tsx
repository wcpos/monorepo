/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { ProductName } from './product-name';
import { openLineQuantity } from '../../conditions/use-cart-conditions';
import { CartTableReadOnlyProvider } from './read-only';

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

jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-1' } }),
}));
jest.mock('../../hooks/use-update-cart-line', () => ({
	useUpdateCartLine: () => ({ updateCartLine: jest.fn() }),
}));
jest.mock('../../hooks/stock-rejection', () => ({
	stockRejection$: new (jest.requireActual('rxjs').BehaviorSubject)(null),
	getStockRejectionForLine: () => mockRejection,
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, params?: Record<string, unknown>) =>
		params ? `${key} ${JSON.stringify(params)}` : key,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: ({ name }: { name: string }) => `[${name}]` }));
let mockUnmet: { lineUuid: string; available: number | null }[] = [];
let mockRejection: { available: number | null } | null = null;
jest.mock('../../conditions/use-cart-conditions', () => ({
	...jest.requireActual('../../conditions/use-cart-conditions'),
	useCartUnmet: () => mockUnmet,
}));
jest.mock('../../../../../contexts/app-state', () => ({ useStoreSession: jest.fn() }));
jest.mock('@wcpos/components/editable-field', () => ({
	EditableField: () => <span data-testid="editable-name" />,
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label }: { label: string }) => <span data-testid="paid-by">{label}</span>,
}));

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
	const scrollToRow = jest.fn();
	const props = (uuid: string) =>
		({
			row: { original: { uuid, type: 'line_items', item: { name: 'Belt', meta_data: [] } } },
			column: { columnDef: { meta: { show: () => false } } },
			table: { options: { data: [], meta: { scrollToRow } } },
		}) as unknown as React.ComponentProps<typeof ProductName>;
	afterEach(() => {
		mockUnmet = [];
		mockRejection = null;
		scrollToRow.mockClear();
	});

	it('marks a line the cart judges over stock: attention icon, words readable in both themes', () => {
		mockUnmet = [{ lineUuid: 'line-1', available: 2 }];
		render(<ProductName {...props('line-1')} />);
		const mark = screen.getByTestId('cart-line-stock-mark');
		expect(mark.textContent).toBe('[product]pos_cart.n_available {"quantity":2}');
		expect(mark.innerHTML).toContain('text-foreground');
		expect(mark.innerHTML).not.toMatch(/text-destructive|text-attention/);
	});

	it('says out of stock when nothing is known, and marks no other line', () => {
		mockUnmet = [{ lineUuid: 'line-1', available: null }];
		render(<ProductName {...props('line-1')} />);
		expect(screen.getByTestId('cart-line-stock-mark').textContent).toBe(
			'[product]common.out_of_stock'
		);
		render(<ProductName {...props('line-2')} />);
		expect(screen.getAllByTestId('cart-line-stock-mark')).toHaveLength(1);
	});

	it.each([0, -2])(
		'reads out of stock at %d left, never a count of what is not there',
		(available) => {
			mockUnmet = [{ lineUuid: 'line-1', available }];
			render(<ProductName {...props('line-1')} />);
			expect(screen.getByTestId('cart-line-stock-mark').textContent).toBe(
				'[product]common.out_of_stock'
			);
		}
	);

	it('prefers the cart’s own judgement over the server’s refusal', () => {
		mockRejection = { available: 5 };
		mockUnmet = [{ lineUuid: 'line-1', available: 2 }];
		render(<ProductName {...props('line-1')} />);
		expect(screen.getByTestId('cart-line-stock-mark').textContent).toBe(
			'[product]pos_cart.n_available {"quantity":2}'
		);
	});

	it('registers the line’s scroll, so the notice reaches it with the quantity column hidden', () => {
		const { unmount } = render(<ProductName {...props('line-s')} />);
		openLineQuantity('line-s'); // no keypad registered: the tap still scrolls to the line
		expect(scrollToRow).toHaveBeenCalledWith('line-s');
		unmount();
		openLineQuantity('line-s');
		expect(scrollToRow).toHaveBeenCalledTimes(1);
	});
});

describe('read-only (checkout and receipt)', () => {
	const scrollToRow = jest.fn();
	const props = {
		row: {
			original: {
				uuid: 'line-7',
				type: 'line_items',
				item: { id: 7, name: 'Belt &amp; Buckle', meta_data: [] },
			},
		},
		column: { columnDef: { meta: { show: () => false } } },
		table: { options: { data: [], meta: { scrollToRow } } },
	} as unknown as React.ComponentProps<typeof ProductName>;

	it('shows the name as text, with no field to edit, and the split-payment annotation', () => {
		render(
			<CartTableReadOnlyProvider value={{ paidBy: { 'line-7': ['Cash', 'Card'] } }}>
				<ProductName {...props} />
			</CartTableReadOnlyProvider>
		);
		expect(screen.getByText('Belt & Buckle')).toBeTruthy();
		expect(screen.queryByTestId('editable-name')).toBeNull();
		expect(screen.getByTestId('paid-by').textContent).toBe(
			'pos_checkout.line_paid_by {"methods":"Cash + Card"}'
		);
	});

	it('keys the annotation by the server line id when the line has no POS uuid', () => {
		const serverOnly = {
			...props,
			row: { original: { ...props.row.original, uuid: '' } },
		} as unknown as React.ComponentProps<typeof ProductName>;
		render(
			<CartTableReadOnlyProvider value={{ paidBy: { 7: ['Cash'] } }}>
				<ProductName {...serverOnly} />
			</CartTableReadOnlyProvider>
		);
		expect(screen.getByTestId('paid-by').textContent).toContain('Cash');
	});

	it('registers no scroll target: the stilled cart never scrolls to a row', () => {
		const { unmount } = render(
			<CartTableReadOnlyProvider value={{}}>
				<ProductName {...props} />
			</CartTableReadOnlyProvider>
		);
		openLineQuantity('line-7');
		expect(scrollToRow).not.toHaveBeenCalled();
		unmount();
	});

	it('shows the editable field and no annotation in the cart', () => {
		render(<ProductName {...props} />);
		expect(screen.getByTestId('editable-name')).toBeTruthy();
		expect(screen.queryByTestId('paid-by')).toBeNull();
	});
});
