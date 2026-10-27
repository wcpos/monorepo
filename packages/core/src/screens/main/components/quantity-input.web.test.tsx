/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { QuantityInput } from './quantity-input.web';

type MockKeypadProps = {
	format: (value: number) => string;
	decimals?: number;
	disabled?: boolean;
	onRemove?: () => void;
	onOpenChange: (open: boolean) => void;
	ref: React.Ref<{ focus: () => void; dismiss: () => void }>;
};
let mockKeypad: MockKeypadProps;
const mockDismiss = jest.fn();
jest.mock('@wcpos/components/quantity-keypad', () => ({
	QuantityKeypad: (props: MockKeypadProps) => {
		mockKeypad = props;
		jest.requireActual('react').useImperativeHandle(props.ref, () => ({
			focus: jest.fn(),
			dismiss: mockDismiss,
		}));
		return null;
	},
}));
jest.mock('../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
// A store that prices to two places (the quantity must not take the currency's scale) and
// whose barcodes are at least eight characters long.
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (store: Record<string, unknown>) => unknown) =>
		select({
			price_decimal_sep: '.',
			price_thousand_sep: ',',
			price_num_decimals: 2,
			thousands_group_style: 'thousand',
			barcode_scanning_min_chars: 8,
		}),
}));

const renderInput = () =>
	render(<QuantityInput value={3} onChangeText={jest.fn()} onRemove={jest.fn()} />);

it('shows a fractional quantity with its digits, and a whole one without decimals', () => {
	renderInput();
	expect(mockKeypad.format(1.125)).toBe('1.125');
	expect(mockKeypad.format(1.2345)).toBe('1.2345');
	expect(mockKeypad.format(0.001)).toBe('0.001');
	expect(mockKeypad.format(12)).toBe('12');
	expect(mockKeypad.format(123)).toBe('123');
});

it('a stock count: whole numbers grouped, no trash, disabled passed on', () => {
	render(<QuantityInput value={4} decimals={0} disabled onChangeText={jest.fn()} />);
	expect(mockKeypad.format(123456)).toBe('123,456');
	expect(mockKeypad.decimals).toBe(0);
	expect(mockKeypad.disabled).toBe(true);
	expect(mockKeypad.onRemove).toBeUndefined();
});

describe('a scanner burst while the keypad is open', () => {
	// Stands in for the route's wedge detector: its capture listener, registered first, marks
	// every key but the first of a latched burst with `preventDefault`.
	const detector = (event: KeyboardEvent) => {
		if (event.key !== 'first') event.preventDefault();
	};
	const key = (name: string) =>
		document.dispatchEvent(new KeyboardEvent('keydown', { key: name, cancelable: true }));
	beforeEach(() => {
		mockDismiss.mockClear();
		document.addEventListener('keydown', detector, true);
		renderInput();
		act(() => mockKeypad.onOpenChange(true));
	});
	afterEach(() => document.removeEventListener('keydown', detector, true));

	it('one marked key (a quick typist) leaves the keypad open', () => {
		key('first');
		key('2');
		expect(mockDismiss).not.toHaveBeenCalled();
	});

	it('a run as long as a barcode, less its unmarked first key, dismisses it', () => {
		key('first');
		for (let i = 0; i < 7; i++) key(String(i));
		expect(mockDismiss).toHaveBeenCalledTimes(1);
	});

	it('after the keypad has closed, a full burst does nothing: the listener is gone', () => {
		act(() => mockKeypad.onOpenChange(false));
		key('first');
		for (let i = 0; i < 7; i++) key(String(i));
		expect(mockDismiss).not.toHaveBeenCalled();
	});

	it('an unmarked key ends the run', () => {
		key('2');
		key('3');
		key('first');
		for (let i = 0; i < 6; i++) key(String(i));
		expect(mockDismiss).not.toHaveBeenCalled();
	});
});
