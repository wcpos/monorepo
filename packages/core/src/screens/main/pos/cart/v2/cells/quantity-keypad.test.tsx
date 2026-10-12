/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Quantity } from './quantity-keypad';
import { Quantity as OldQuantity } from '../../cells/quantity';
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

it.each([
	['old', OldQuantity],
	['v2', Quantity],
] as const)('%s keeps the quantity id/value and commits the same hook arguments', (_name, Cell) => {
	mockUpdateLineItem.mockClear();
	const props = {
		row: { original: { uuid: 'line-1', type: 'line_items', item: { quantity: 20 } } },
		column: { columnDef: { meta: { show: () => false } } },
	} as unknown as React.ComponentProps<typeof Quantity>;
	render(<Cell {...props} />);
	const input = screen.getByTestId('cart-quantity-input') as HTMLInputElement;
	expect(input.value).toBe('20');
	fireEvent.change(input, { target: { value: '3' } });
	fireEvent.keyDown(input, { key: 'Enter' });
	expect(mockUpdateLineItem).toHaveBeenCalledTimes(1);
	expect(mockUpdateLineItem).toHaveBeenCalledWith('line-1', { quantity: 3 });
});

it('the conditions notice and a blocked Pay reach a mounted line: scroll, then its keypad', () => {
	const scrollToRow = jest.fn();
	const props = {
		row: { original: { uuid: 'line-1', type: 'line_items', item: { quantity: 3 } } },
		column: { columnDef: { meta: { show: () => false } } },
		table: { options: { meta: { scrollToRow } } },
	} as unknown as React.ComponentProps<typeof Quantity>;
	const { unmount } = render(<Quantity {...props} />);
	const input = screen.getByTestId('cart-quantity-input');
	scrollToLine('line-1');
	expect(scrollToRow).toHaveBeenCalledWith('line-1');
	expect(document.activeElement).not.toBe(input);
	openLineQuantity('line-1');
	expect(scrollToRow).toHaveBeenCalledTimes(2);
	expect(document.activeElement).toBe(input);
	// Unmounted, the line is no longer reachable.
	unmount();
	scrollToLine('line-1');
	expect(scrollToRow).toHaveBeenCalledTimes(2);
});
