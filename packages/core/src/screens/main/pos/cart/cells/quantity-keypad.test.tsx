/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Quantity } from './quantity-keypad';
import { CartTableReadOnlyProvider } from './read-only';
import { openLineQuantity, scrollToLine } from '../../conditions/use-cart-conditions';

const mockUpdateCartLine = jest.fn().mockResolvedValue({});
let mockOnChangeText: (value: number) => Promise<boolean>;
const mockSplitLineItem = jest.fn();
const mockRemoveLineItem = jest.fn();
jest.mock('../../hooks/use-remove-line-item', () => ({
	useRemoveLineItem: () => ({ removeLineItem: mockRemoveLineItem }),
}));
jest.mock('../../hooks/use-split-line-item', () => ({
	useSplitLineItem: () => ({ splitLineItem: mockSplitLineItem }),
}));
jest.mock('../../hooks/use-update-cart-line', () => ({
	useUpdateCartLine: () => ({ updateCartLine: mockUpdateCartLine }),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
// The conditions module's own reads (store session) are not under test here.
jest.mock('../../../../../contexts/app-state', () => ({ useStoreSession: jest.fn() }));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: jest.requireActual('react-native').View }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: jest.requireActual('react-native').View }));
jest.mock('../../../hooks/use-number-format', () => ({
	QUANTITY_FORMAT: {},
	useNumberFormat: () => ({ format: String }),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({
		testID,
		disabled,
		onPress,
		accessibilityLabel,
	}: {
		testID: string;
		disabled?: boolean;
		onPress: () => void;
		accessibilityLabel: string;
	}) => (
		<button
			data-testid={testID}
			disabled={disabled}
			aria-label={accessibilityLabel}
			onClick={onPress}
		/>
	),
}));
// The cell owns the value/id/commit/remove seam; the amount field owns its keypad.
jest.mock('../../../components/amount-field', () => ({
	AmountField: ({
		testID,
		value,
		onCommit,
		onRemove,
		ref,
		className,
	}: {
		testID: string;
		value: number;
		onCommit: (value: number) => Promise<boolean>;
		onRemove: () => void;
		ref?: React.Ref<HTMLInputElement>;
		className?: string;
	}) => {
		mockOnChangeText = onCommit;
		return (
			<input
				ref={ref}
				className={className}
				data-testid={testID}
				defaultValue={value}
				onKeyDown={(event) => {
					if (event.key === 'Enter') void onCommit(Number(event.currentTarget.value));
					if (event.key === 'Delete') onRemove();
				}}
			/>
		);
	},
}));

it('keeps the quantity id/value and commits the same hook arguments', () => {
	mockUpdateCartLine.mockClear();
	const props = {
		row: { original: { uuid: 'line-1', type: 'line_items', item: { quantity: 20 } } },
		column: { columnDef: { meta: { show: () => false } } },
	} as unknown as React.ComponentProps<typeof Quantity>;
	render(<Quantity {...props} />);
	const input = screen.getByTestId('cart-quantity-input') as HTMLInputElement;
	expect(input.value).toBe('20');
	expect(input.className).toContain('rounded-control');
	// The width is the shared field's: a caller-level width would erase the open/invalid border (Codex, #3139).
	expect(input.className).not.toContain('border-[length:var(--shape-ctl-border)]');
	fireEvent.change(input, { target: { value: '3' } });
	fireEvent.keyDown(input, { key: 'Enter' });
	expect(mockUpdateCartLine).toHaveBeenCalledTimes(1);
	expect(mockUpdateCartLine).toHaveBeenCalledWith('line_items', 'line-1', { quantity: 3 });
});

it('− at 1 removes the line through the cart’s own remove path', () => {
	mockRemoveLineItem.mockClear();
	const props = {
		row: { original: { uuid: 'line-r', type: 'line_items', item: { quantity: 1 } } },
		column: { columnDef: { meta: { show: () => false } } },
	} as unknown as React.ComponentProps<typeof Quantity>;
	render(<Quantity {...props} />);
	fireEvent.keyDown(screen.getByTestId('cart-quantity-input'), { key: 'Delete' });
	expect(mockRemoveLineItem).toHaveBeenCalledTimes(1);
	expect(mockRemoveLineItem).toHaveBeenCalledWith('line-r', 'line_items');
});

it('a mounted keypad is what the notice opens; it registers no scroll of its own', () => {
	const props = {
		row: { original: { uuid: 'line-q', type: 'line_items', item: { quantity: 3 } } },
		column: { columnDef: { meta: { show: () => false } } },
	} as unknown as React.ComponentProps<typeof Quantity>;
	const { unmount } = render(<Quantity {...props} />);
	const input = screen.getByTestId('cart-quantity-input');
	scrollToLine('line-q'); // nothing registered a scroll: a no-op, not a throw
	expect(document.activeElement).not.toBe(input);
	openLineQuantity('line-q');
	expect(document.activeElement).toBe(input);
	input.blur();
	unmount();
	openLineQuantity('line-q');
	expect(document.activeElement).not.toBe(input);
});

it('the Split link passes its line uuid to the split hook', () => {
	mockSplitLineItem.mockClear();
	const props = {
		row: { original: { uuid: 'line-split', type: 'line_items', item: { quantity: 3 } } },
		column: { columnDef: { meta: { show: () => true } } },
	} as unknown as React.ComponentProps<typeof Quantity>;
	render(<Quantity {...props} />);
	fireEvent.click(screen.getByTestId('cart-line-split'));
	expect(mockSplitLineItem).toHaveBeenCalledTimes(1);
	expect(mockSplitLineItem).toHaveBeenCalledWith('line-split');
});

it('tells the keypad whether the store took the quantity (the stock guard can refuse it)', async () => {
	const props = {
		row: { original: { uuid: 'line-s', type: 'line_items', item: { quantity: 3 } } },
		column: { columnDef: { meta: { show: () => false } } },
	} as unknown as React.ComponentProps<typeof Quantity>;
	render(<Quantity {...props} />);
	mockUpdateCartLine.mockResolvedValueOnce(false);
	await expect(mockOnChangeText(4)).resolves.toBe(false);
	await expect(mockOnChangeText(4)).resolves.toBe(true);
});

describe('the bill as the split picker (read-only, Split on)', () => {
	const row = (quantity: number) =>
		({
			row: { original: { uuid: 'line-4', type: 'line_items', item: { id: 4, quantity } } },
			column: { columnDef: { meta: { show: () => false } } },
		}) as unknown as React.ComponentProps<typeof Quantity>;
	const pick = jest.fn();
	const picker = (picked: number, paidUnits: number) => ({
		picked: { 'line-4': picked },
		paid: { 'line-4': { units: paidUnits, methods: ['Card'] } },
		unitMinor: (_key: string | number, units: number) => units * 500,
		format: (minor: number) => `$${(minor / 100).toFixed(2)}`,
		pick,
	});
	const renderPicker = (quantity: number, picked: number, paidUnits: number) =>
		render(
			<CartTableReadOnlyProvider value={{ picker: picker(picked, paidUnits) }}>
				<Quantity {...row(quantity)} />
			</CartTableReadOnlyProvider>
		);

	it("is THIS payment's stepper over the unpaid units, with the picked money under it", () => {
		pick.mockClear();
		renderPicker(5, 1, 1);
		expect(screen.getByTestId('checkout-line-line-4-units').textContent).toBe('1 of 4');
		expect(screen.getByTestId('checkout-line-line-4-plus').getAttribute('aria-label')).toBe(
			'One more'
		);
		expect(screen.getByText('$5.00')).toBeTruthy();
		expect(screen.getByTestId('checkout-line-line-4-minus').hasAttribute('disabled')).toBe(false);
		fireEvent.click(screen.getByTestId('checkout-line-line-4-plus'));
		expect(pick).toHaveBeenCalledWith('line-4', 2);
		fireEvent.click(screen.getByTestId('checkout-line-line-4-minus'));
		expect(pick).toHaveBeenLastCalledWith('line-4', 0);
		expect(screen.queryByTestId('checkout-ledger-qty-line-4')).toBeNull();
		expect(screen.queryByTestId('cart-quantity-input')).toBeNull();
	});

	it('disables − at none picked and + at every unpaid unit picked', () => {
		const { unmount } = renderPicker(4, 0, 0);
		expect(screen.getByTestId('checkout-line-line-4-minus').hasAttribute('disabled')).toBe(true);
		expect(screen.getByTestId('checkout-line-line-4-plus').hasAttribute('disabled')).toBe(false);
		expect(screen.queryByText('$0.00')).toBeNull();
		unmount();
		renderPicker(4, 3, 1);
		expect(screen.getByTestId('checkout-line-line-4-plus').hasAttribute('disabled')).toBe(true);
	});

	it('keeps a fully paid line plain text', () => {
		renderPicker(2, 0, 2);
		expect(screen.getByTestId('checkout-ledger-qty-line-4').textContent).toBe('2');
		expect(screen.queryByTestId('checkout-line-line-4-plus')).toBeNull();
	});
});
