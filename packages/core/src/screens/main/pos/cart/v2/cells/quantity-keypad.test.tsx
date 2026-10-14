/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Quantity } from './quantity-keypad';
import { openLineQuantity, scrollToLine } from '../../../conditions/use-cart-conditions';

const mockUpdateLineItem = jest.fn();
jest.mock('../../../hooks/use-update-line-item', () => ({
	useUpdateLineItem: () => ({ updateLineItem: mockUpdateLineItem, splitLineItem: jest.fn() }),
}));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
// The conditions module's own reads (store session) are not under test here.
jest.mock('../../../../../../contexts/app-state', () => ({ useStoreSession: jest.fn() }));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: jest.requireActual('react-native').View }));
// The cell owns the value/id/commit seam; the unchanged NumberInput owns its keypad.
jest.mock('../../../../components/number-input', () => ({
	NumberInput: ({
		testID,
		value,
		onChangeText,
		ref,
		className,
	}: {
		testID: string;
		value: number;
		onChangeText: (value: number) => void;
		ref?: React.Ref<HTMLInputElement>;
		className?: string;
	}) => (
		<input
			ref={ref}
			className={className}
			data-testid={testID}
			defaultValue={value}
			onKeyDown={(event) => {
				if (event.key === 'Enter') onChangeText(Number(event.currentTarget.value));
			}}
		/>
	),
}));

it('keeps the quantity id/value and commits the same hook arguments', () => {
	mockUpdateLineItem.mockClear();
	const props = {
		row: { original: { uuid: 'line-1', type: 'line_items', item: { quantity: 20 } } },
		column: { columnDef: { meta: { show: () => false } } },
	} as unknown as React.ComponentProps<typeof Quantity>;
	render(<Quantity {...props} />);
	const input = screen.getByTestId('cart-quantity-input') as HTMLInputElement;
	expect(input.value).toBe('20');
	fireEvent.change(input, { target: { value: '3' } });
	fireEvent.keyDown(input, { key: 'Enter' });
	expect(mockUpdateLineItem).toHaveBeenCalledTimes(1);
	expect(mockUpdateLineItem).toHaveBeenCalledWith('line-1', { quantity: 3 });
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
