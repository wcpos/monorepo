/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Quantity } from './quantity-keypad';
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
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
// The conditions module's own reads (store session) are not under test here.
jest.mock('../../../../../contexts/app-state', () => ({ useStoreSession: jest.fn() }));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: jest.requireActual('react-native').View }));
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
