/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Quantity } from './quantity-keypad';
import { Quantity as OldQuantity } from '../../cells/quantity';

const mockUpdateLineItem = jest.fn();
jest.mock('../../../hooks/use-update-line-item', () => ({
	useUpdateLineItem: () => ({ updateLineItem: mockUpdateLineItem, splitLineItem: jest.fn() }),
}));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: jest.requireActual('react-native').View }));
// The cell owns the value/id/commit seam; the unchanged NumberInput owns its keypad.
jest.mock('../../../../components/number-input', () => ({
	NumberInput: ({
		testID,
		value,
		onChangeText,
	}: {
		testID: string;
		value: number;
		onChangeText: (value: number) => void;
	}) => (
		<input
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
