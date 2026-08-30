/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { NumberInput } from './number-input';

type CapturedInputProps = {
	value?: string;
	selectTextOnFocus?: boolean;
	onChangeText?: (text: string) => void;
	onFocus?: (e: unknown) => void;
	onBlur?: (e: unknown) => void;
};

const mockInput = jest.fn((_props: CapturedInputProps) => null);

jest.mock('@wcpos/components/input', () => ({
	Input: (props: CapturedInputProps) => mockInput(props),
}));

jest.mock('@wcpos/query', () => ({
	useDocField: () => '.',
}));

jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));

const lastInputProps = () => mockInput.mock.calls[mockInput.mock.calls.length - 1][0];

describe('NumberInput (native)', () => {
	beforeEach(() => {
		mockInput.mockClear();
	});

	// A cashier tapping a quantity/price box means "replace this number". Without
	// select-on-focus the caret lands wherever the tap fell; in the narrow tablet
	// cart cell that is BEFORE the digit, and typed digits append (iPad flow 06:
	// three "3"s into a "1" gave "3331"). The Input forwards TextInput props.
	it('selects the whole value on focus so typing replaces it', () => {
		render(<NumberInput value={1} onChangeText={jest.fn()} />);
		expect(lastInputProps().selectTextOnFocus).toBe(true);
	});

	it('emits the typed number on blur, not on every keystroke', () => {
		const onChangeText = jest.fn();
		render(<NumberInput value={1} onChangeText={onChangeText} />);

		React.act(() => lastInputProps().onFocus?.({}));
		React.act(() => lastInputProps().onChangeText?.('3'));
		expect(onChangeText).not.toHaveBeenCalled();
		expect(lastInputProps().value).toBe('3');

		React.act(() => lastInputProps().onBlur?.({}));
		expect(onChangeText).toHaveBeenCalledWith(3);
	});
});
