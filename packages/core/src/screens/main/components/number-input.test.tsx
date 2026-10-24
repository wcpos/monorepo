/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { NumberInput, parseNumber } from './number-input';

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
		fireEvent.change(field, { target: { value: '12,75' } });
		fireEvent.blur(field);
		expect(onChange).toHaveBeenCalledWith(12.75);
	});

	it('writes nothing on a focus and leave, or on retyping the same number', () => {
		const onChange = jest.fn();
		render(<NumberInput testID="price" value="3.2" onChangeText={onChange} />);
		const field = screen.getByTestId('price') as HTMLInputElement;

		fireEvent.focus(field);
		fireEvent.blur(field);
		expect(onChange).not.toHaveBeenCalled();

		fireEvent.focus(field);
		fireEvent.change(field, { target: { value: '3.20' } });
		fireEvent.blur(field);
		expect(onChange).not.toHaveBeenCalled();

		fireEvent.focus(field);
		fireEvent.change(field, { target: { value: '3.5' } });
		fireEvent.blur(field);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(3.5);
	});

	it('leaves a blank field blank: no 0 written for a focus and leave', () => {
		const onChange = jest.fn();
		render(<NumberInput testID="regular" value="" onChangeText={onChange} />);
		const field = screen.getByTestId('regular') as HTMLInputElement;
		fireEvent.focus(field);
		fireEvent.blur(field);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('writes a typed 0 over a blank, once', () => {
		const onChange = jest.fn();
		render(<NumberInput testID="regular" value="" onChangeText={onChange} />);
		const field = screen.getByTestId('regular') as HTMLInputElement;
		fireEvent.focus(field);
		fireEvent.change(field, { target: { value: '0' } });
		fireEvent.blur(field);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(0);
	});

	it('writes nothing for text it cannot read, and shows the stored value again', () => {
		const onChange = jest.fn();
		render(<NumberInput testID="price" value={5} onChangeText={onChange} />);
		const field = screen.getByTestId('price') as HTMLInputElement;
		fireEvent.focus(field);
		fireEvent.change(field, { target: { value: '1.2.3,4' } });
		fireEvent.blur(field);
		expect(onChange).not.toHaveBeenCalled();
		expect(field.value).toBe('5');
	});

	it('shows an empty value as an empty field', () => {
		render(<NumberInput testID="min" value={undefined} onChangeText={jest.fn()} />);
		expect((screen.getByTestId('min') as HTMLInputElement).value).toBe('');
	});
});

describe('parseNumber', () => {
	it.each([
		// [text, decimal, thousands, expected]
		['1,234.50', '.', ',', 1234.5], // both separators: the thousands one is grouping
		['1.234,50', ',', '.', 1234.5], // the same on a comma store
		['1,5', ',', '.', 1.5], // a single comma is the decimal on a comma store
		['9.99', ',', '.', 9.99], // a single dot is a decimal on a comma store (fr_FR E2E types '.')
		['1,5', '.', ',', 1.5], // and a single comma on a dot store, as before
		['1,234,567', '.', ',', 1234567], // a separator twice is grouping
		['1.234.567', ',', '.', 1234567],
		['1 234,50', ',', ' ', 1234.5], // a space thousands separator is never a decimal
		['-12.5', '.', ',', -12.5],
		['', '.', ',', 0],
	])('%s with decimal %s and thousands %s reads %d', (text, decimal, thousands, expected) => {
		expect(parseNumber(text, decimal, thousands)).toBe(expected);
	});

	it.each([
		['1.2.3,4', '.', ','], // two points left after the grouping is stripped
		['12abc', '.', ','],
		['1,2,3.4.5', '.', ','],
	])('%s is unreadable (NaN): nothing is written', (text, decimal, thousands) => {
		expect(parseNumber(text, decimal, thousands)).toBeNaN();
	});
});
