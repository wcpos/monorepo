/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { CurrencyInput } from './currency-input.web';
import { PercentInput } from './percent-input.web';

import type { KeypadFieldHandle } from './money-input';

type MockKeypadProps = {
	value?: number;
	format: (value: number) => string;
	decimals: number;
	discounts?: number[];
	field?: boolean;
	placeholder?: string;
	labelledBy?: string;
	onChange: (value: number) => void;
	onOpenChange: (open: boolean) => void;
	ref: React.Ref<{ focus: () => void; dismiss: () => void }>;
};
// Jest has no platform resolution: the fields' `./money-input` is the web one, as Metro bundles it.
jest.mock('./money-input', () => jest.requireActual('./money-input.web'));
let mockKeypad: MockKeypadProps;
const mockFocus = jest.fn();
const mockDismiss = jest.fn();
jest.mock('@wcpos/components/price-keypad', () => ({
	PriceKeypad: (props: MockKeypadProps) => {
		mockKeypad = props;
		jest.requireActual('react').useImperativeHandle(props.ref, () => ({
			focus: mockFocus,
			dismiss: mockDismiss,
		}));
		return null;
	},
}));
jest.mock('../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
// A comma store that prices to no places: a percentage must still read 12,5.
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (store: Record<string, unknown>) => unknown) =>
		select({
			price_decimal_sep: ',',
			price_thousand_sep: '.',
			price_num_decimals: 0,
			thousands_group_style: 'thousand',
		}),
}));

it("a form's money field is the outlined price keypad, at the store's places, with no quick keys", () => {
	const onChangeText = jest.fn();
	render(
		<CurrencyInput
			value="1234"
			placeholder="No minimum"
			aria-labelledby="coupon-minimum"
			onChangeText={onChangeText}
		/>
	);
	expect(mockKeypad.field).toBe(true);
	expect(mockKeypad.value).toBe(1234);
	expect(mockKeypad.decimals).toBe(0);
	expect(mockKeypad.discounts).toBeUndefined();
	expect(mockKeypad.format(1234)).toBe('1.234');
	expect(mockKeypad.placeholder).toBe('No minimum');
	expect(mockKeypad.labelledBy).toBe('coupon-minimum');
	mockKeypad.onChange(15);
	expect(onChangeText).toHaveBeenCalledWith(15);
});

it('a blank money field rests on its placeholder, never 0', () => {
	render(<CurrencyInput value="" onChangeText={jest.fn()} />);
	expect(mockKeypad.value).toBeUndefined();
});

it("a form's percentage takes hundredths on a store pricing to none, and reads 12,5", () => {
	render(<PercentInput value="12.5" onChangeText={jest.fn()} />);
	expect(mockKeypad.field).toBe(true);
	expect(mockKeypad.decimals).toBe(2);
	expect(mockKeypad.format(12.5)).toBe('12,5');
});

it("a form label's press opens the keypad, and pressed again while open closes it", () => {
	const ref = React.createRef<KeypadFieldHandle>();
	render(<CurrencyInput ref={ref} value="5" onChangeText={jest.fn()} />);
	expect(ref.current?.isFocused()).toBe(false);
	ref.current?.focus();
	expect(mockFocus).toHaveBeenCalledTimes(1);
	act(() => mockKeypad.onOpenChange(true));
	expect(ref.current?.isFocused()).toBe(true);
	ref.current?.blur();
	expect(mockDismiss).toHaveBeenCalledTimes(1);
});
