/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { NumberInput } from './number-input';

// next's Input renders the Uniwind/SVG icon, whose ESM builds jest cannot load.
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));
const mockStore = {
	price_decimal_sep: '.',
	price_thousand_sep: ',',
	price_num_decimals: 2,
	thousands_group_style: 'thousand',
};
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (store: typeof mockStore) => unknown) => select(mockStore),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress: () => void; testID?: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));

afterEach(() => {
	mockStore.price_decimal_sep = '.';
	mockStore.price_thousand_sep = ',';
});

describe('NumberInput', () => {
	it('replaces the native field when the value changes while unfocused', () => {
		const onChange = jest.fn();
		const { rerender } = render(<NumberInput testID="qty" value={18} onChangeText={onChange} />);
		const first = screen.getByTestId('qty');

		rerender(<NumberInput testID="qty" value={19} onChangeText={onChange} />);
		rerender(<NumberInput testID="qty" value={20} onChangeText={onChange} />);

		const current = screen.getByTestId('qty') as HTMLInputElement;
		expect(current).not.toBe(first);
		expect(current.value).toBe('20');
	});

	it('keeps the same field and the draft while focused', () => {
		const onChange = jest.fn();
		const { rerender } = render(<NumberInput testID="qty" value={1} onChangeText={onChange} />);
		const focused = screen.getByTestId('qty') as HTMLInputElement;
		fireEvent.focus(focused);
		fireEvent.change(focused, { target: { value: '7' } });

		rerender(<NumberInput testID="qty" value={5} onChangeText={onChange} />);

		expect(screen.getByTestId('qty')).toBe(focused);
		expect(focused.value).toBe('7');
		fireEvent.blur(focused);
		expect(onChange).toHaveBeenCalledWith(7);
	});

	it('does not remount when an unfocused rerender keeps the value', () => {
		const onChange = jest.fn();
		const { rerender } = render(<NumberInput testID="qty" value={3} onChangeText={onChange} />);
		const first = screen.getByTestId('qty');

		rerender(<NumberInput testID="qty" value={3} onChangeText={onChange} />);

		expect(screen.getByTestId('qty')).toBe(first);
	});

	it('reads formatted at rest and raw while focused, and blur emits the parsed number', () => {
		const onChange = jest.fn();
		render(
			<NumberInput
				testID="price"
				value={1234.5}
				formatOptions={{ fixedDecimalScale: true }}
				onChangeText={onChange}
			/>
		);
		const field = screen.getByTestId('price') as HTMLInputElement;
		expect(field.value).toBe('1,234.50');

		fireEvent.focus(field);
		expect(field.value).toBe('1234.5');

		fireEvent.change(field, { target: { value: '1234.75' } });
		fireEvent.blur(field);
		// The raw string is parsed, never the grouped one: 1,234.75 would have read as 1.
		expect(onChange).toHaveBeenCalledWith(1234.75);
	});

	it('uses the store separators: a comma store reads 12,5 and edits 12,5', () => {
		mockStore.price_decimal_sep = ',';
		mockStore.price_thousand_sep = '.';
		const onChange = jest.fn();
		render(<NumberInput testID="pct" value={12.5} onChangeText={onChange} />);
		const field = screen.getByTestId('pct') as HTMLInputElement;
		expect(field.value).toBe('12,5');

		fireEvent.focus(field);
		expect(field.value).toBe('12,5');
		fireEvent.blur(field);
		expect(onChange).toHaveBeenCalledWith(12.5);
	});

	it('shows an empty value as an empty field', () => {
		render(<NumberInput testID="min" value={undefined} onChangeText={jest.fn()} />);
		expect((screen.getByTestId('min') as HTMLInputElement).value).toBe('');
	});
});
