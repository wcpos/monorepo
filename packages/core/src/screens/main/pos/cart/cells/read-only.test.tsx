/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Price } from './price';
import { ProductTotal } from './product-total';
import { Quantity } from './quantity-keypad';
import { CartTableReadOnlyProvider } from './read-only';

// The checkout ledger's line test, moved onto the table's own cells: in read-only mode
// they carry the ledger's testIDs and render what the inputs show, as text.
let mockTaxDisplayCart: 'excl' | 'incl' = 'excl';
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (value: unknown) => unknown) =>
		select({ tax_display_cart: mockTaxDisplayCart, quickDiscounts: [] }),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
	useStoreSession: jest.fn(),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../hooks/use-current-order-currency-format', () => ({
	useCurrentOrderCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../../hooks/use-number-format', () => ({
	useNumberFormat: () => ({ format: (value: number) => String(value).replace('.', ',') }),
}));
jest.mock('../../hooks/use-line-item-data', () => ({
	useLineItemData: () => ({
		getLineItemData: () => ({ price: 55, regular_price: 55 }),
	}),
}));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: {} }),
}));
jest.mock('../../hooks/use-update-cart-line', () => ({
	useUpdateCartLine: () => ({ updateCartLine: jest.fn() }),
}));
jest.mock('../../hooks/use-split-line-item', () => ({
	useSplitLineItem: () => ({ splitLineItem: jest.fn() }),
}));
jest.mock('../../hooks/use-remove-line-item', () => ({
	useRemoveLineItem: () => ({ removeLineItem: jest.fn() }),
}));
jest.mock('../../../components/quantity-input', () => ({
	QuantityInput: () => <input data-testid="cart-quantity-input" />,
}));
jest.mock('../../../components/editable-number', () => ({
	EditableNumber: () => <input data-testid="cart-price" />,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const item = { id: 7, quantity: 2, total: '110.00', total_tax: '9.80', subtotal: '110.00' };
const props = {
	row: { original: { uuid: '', type: 'line_items', item } },
	column: { columnDef: { meta: { show: () => false } } },
} as unknown as React.ComponentProps<typeof Quantity> &
	React.ComponentProps<typeof Price> &
	React.ComponentProps<typeof ProductTotal>;

function ReadOnly({ children }: React.PropsWithChildren) {
	return <CartTableReadOnlyProvider value={{}}>{children}</CartTableReadOnlyProvider>;
}

afterEach(() => {
	mockTaxDisplayCart = 'excl';
});

it('lays each line out as text under the table head: qty, unit price, total per tax display', () => {
	const { unmount } = render(
		<ReadOnly>
			<Quantity {...props} />
			<Price {...props} />
			<ProductTotal {...props} />
		</ReadOnly>
	);
	expect(screen.getByTestId('checkout-ledger-qty-7').textContent).toBe('2');
	expect(screen.getByTestId('checkout-ledger-price-7').textContent).toBe('$55.00');
	expect(screen.getByTestId('checkout-ledger-total-7').textContent).toBe('$110.00');
	expect(screen.queryByTestId('cart-quantity-input')).toBeNull();
	expect(screen.queryByTestId('cart-price')).toBeNull();
	unmount();
	// A fractional quantity reads with the store's separators, as the input shows it.
	const half = {
		...props,
		row: { original: { ...props.row.original, item: { ...item, quantity: 1.5 } } },
	} as typeof props;
	const { unmount: unmountHalf } = render(
		<ReadOnly>
			<Quantity {...half} />
		</ReadOnly>
	);
	expect(screen.getByTestId('checkout-ledger-qty-7').textContent).toBe('1,5');
	unmountHalf();
	mockTaxDisplayCart = 'incl';
	render(
		<ReadOnly>
			<ProductTotal {...props} />
		</ReadOnly>
	);
	expect(screen.getByTestId('checkout-ledger-total-7').textContent).toBe('$119.80');
});

it('keeps the inputs, and no ledger testIDs, in the editable cart', () => {
	render(
		<>
			<Quantity {...props} />
			<Price {...props} />
			<ProductTotal {...props} />
		</>
	);
	expect(screen.getByTestId('cart-quantity-input')).toBeTruthy();
	expect(screen.getByTestId('cart-price')).toBeTruthy();
	expect(screen.queryByTestId('checkout-ledger-qty-7')).toBeNull();
	expect(screen.queryByTestId('checkout-ledger-total-7')).toBeNull();
});
