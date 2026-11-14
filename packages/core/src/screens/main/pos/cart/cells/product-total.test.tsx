/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { ProductTotal } from './product-total';
import { CartTableReadOnlyProvider } from './read-only';

// Decision 4A: a line's Total is the line before cart discounts and coupons, so the lines add
// up to Subtotal and the discount shows once, under it.
let mockTaxDisplayCart: 'excl' | 'incl' = 'excl';
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (value: unknown) => unknown) =>
		select({ tax_display_cart: mockTaxDisplayCart }),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));
jest.mock('../../../hooks/use-current-order-currency-format', () => ({
	useCurrentOrderCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('./use-line-tax-label', () => ({
	useLineTaxLabel: () => (tax: number) => `tax:${tax}`,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({
		children,
		testID,
		className,
	}: React.PropsWithChildren<{ testID?: string; className?: string }>) => (
		<span data-testid={testID} data-class={className}>
			{children}
		</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const discounted = {
	id: 7,
	quantity: 1,
	subtotal: '45.00',
	subtotal_tax: '4.50',
	total: '40.50',
	total_tax: '4.05',
};

function renderLine(item: Record<string, unknown>) {
	const props = {
		row: { original: { uuid: '', type: 'line_items', item } },
		column: { columnDef: { meta: { show: () => true } } },
	} as unknown as React.ComponentProps<typeof ProductTotal>;
	return render(
		<CartTableReadOnlyProvider value={{}}>
			<ProductTotal {...props} />
		</CartTableReadOnlyProvider>
	);
}

afterEach(() => {
	mockTaxDisplayCart = 'excl';
});

it('a discounted line shows its amount before the cart discount, with no strike (tax-exclusive)', () => {
	const { container } = renderLine(discounted);
	expect(screen.getByTestId('checkout-ledger-total-7').textContent).toBe('$45.00');
	expect(container.textContent).not.toContain('$40.50');
	container.querySelectorAll('[data-class]').forEach((node) => {
		expect(node.getAttribute('data-class')).not.toContain('line-through');
	});
});

it('tax-inclusive, the line shows subtotal plus its tax', () => {
	mockTaxDisplayCart = 'incl';
	const { container } = renderLine(discounted);
	expect(screen.getByTestId('checkout-ledger-total-7').textContent).toBe('$49.50');
	expect(container.textContent).not.toContain('$44.55');
});

it("the tax tag follows the line's subtotal tax", () => {
	const { container } = renderLine(discounted);
	expect(container.textContent).toContain('tax:4.5');
	expect(container.textContent).not.toContain('tax:4.05');
});

it('a line with no discount shows the same figure as before', () => {
	renderLine({ id: 7, quantity: 2, subtotal: '110.00', total: '110.00' });
	expect(screen.getByTestId('checkout-ledger-total-7').textContent).toBe('$110.00');
});
