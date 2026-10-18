/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { NumberInput } from './number-input';

// next's Input renders the Uniwind/SVG icon, whose ESM builds jest cannot load.
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: () => '.',
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress: () => void; testID?: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));

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
});
