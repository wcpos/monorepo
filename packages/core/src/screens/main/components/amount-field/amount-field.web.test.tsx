/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { AmountField } from './amount-field.web';

import type { AmountFieldHandle, AmountFieldProps } from './types';

// The web adapter: what each kind hands its keypad. The keypads are the library's and have their
// own tests; the commit rule and the store's places are `use-amount`'s, shared with native.
type MockKeypadProps = {
	value?: number;
	format: (value: number) => string;
	decimals: number;
	decimalSeparator: string;
	discounts?: number[];
	field?: boolean;
	tone?: string;
	labelledBy?: string;
	invalid?: boolean;
	labels: Record<string, unknown>;
	onChange: (value: number) => unknown;
	onRemove?: () => void;
	onOpenChange: (open: boolean) => void;
	ref: React.Ref<{ focus: () => void; dismiss: () => void }>;
};
let mockKeypad: MockKeypadProps & { name: string };
const mockFocus = jest.fn();
const mockDismiss = jest.fn();
function mockKeypadAs(name: string) {
	return (props: MockKeypadProps) => {
		mockKeypad = { ...props, name };
		jest.requireActual('react').useImperativeHandle(props.ref, () => ({
			focus: mockFocus,
			dismiss: mockDismiss,
		}));
		return null;
	};
}
jest.mock('@wcpos/components/price-keypad', () => ({ PriceKeypad: mockKeypadAs('price') }));
jest.mock('@wcpos/components/quantity-keypad', () => ({
	QuantityKeypad: mockKeypadAs('quantity'),
}));
jest.mock('../../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
// A comma store that prices to no places: a percentage must still read 12,5.
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (store: Record<string, unknown>) => unknown) =>
		select({
			price_decimal_sep: ',',
			price_thousand_sep: '.',
			price_num_decimals: 0,
			thousands_group_style: 'thousand',
			barcode_scanning_min_chars: 3,
		}),
	useRecordField: () => undefined,
}));

const onCommit = jest.fn();
const renderField = (props: Partial<AmountFieldProps>) =>
	render(<AmountField kind="money" value={5} onCommit={onCommit} {...props} />);

beforeEach(() => onCommit.mockReset());

it.each([
	// [kind, look, keypad, decimals, rest text of 1234.5, outlined]
	['money', 'field', 'price', 0, '1.235', true], // the store's places; a form's box
	['money', 'quiet', 'price', 0, '1.235', false], // a grid's text
	['percent', 'field', 'price', 2, '1.234,5', true], // hundredths on a store pricing to none
	['quantity', 'field', 'quantity', 6, '1.234,5', undefined],
	['count', 'field', 'quantity', 0, '1.234', undefined], // stock: whole, no decimal key (truncated, as before)
] as const)(
	'%s (%s) is the %s keypad at %d places, reading %s',
	(kind, look, keypad, places, rest, outlined) => {
		renderField({ kind, look });
		expect(mockKeypad.name).toBe(keypad);
		expect(mockKeypad.decimals).toBe(places);
		expect(mockKeypad.decimalSeparator).toBe(',');
		expect(mockKeypad.format(1234.5)).toContain(rest);
		expect(mockKeypad.field).toBe(outlined);
	}
);

it('a blank money is blank to the keypad, never 0; a blank count is 0', () => {
	renderField({ value: '' });
	expect(mockKeypad.value).toBeUndefined();
	renderField({ kind: 'count', value: null });
	expect(mockKeypad.value).toBe(0);
});

it("the keypad's write goes through the commit rule: places, no-op, a quantity's 0 is its remove", () => {
	const onRemove = jest.fn();
	renderField({ kind: 'percent', value: 12.5 });
	act(() => void mockKeypad.onChange(12.5));
	expect(onCommit).not.toHaveBeenCalled();
	act(() => void mockKeypad.onChange(12.555));
	expect(onCommit).toHaveBeenCalledWith(12.56);

	renderField({ kind: 'quantity', value: 2, onRemove });
	expect(mockKeypad.onRemove).toBe(onRemove);
	act(() => void mockKeypad.onChange(0));
	expect(onRemove).toHaveBeenCalledTimes(1);
});

it("names the quick keys with the store's separator, and passes the quick discounts and tone", () => {
	renderField({ look: 'quiet', discounts: [12.5] });
	expect(mockKeypad.discounts).toEqual([12.5]);
	expect((mockKeypad.labels.discountKey as (p: number) => string)(12.5)).toBe('−12,5%');
	renderField({ kind: 'quantity', tone: 'attention' });
	expect(mockKeypad.tone).toBe('attention');
});

it("a form's label and invalid state reach the trigger; its label press opens and closes the keypad", () => {
	const handle = React.createRef<AmountFieldHandle>();
	renderField({ ref: handle, 'aria-labelledby': 'label-id', 'aria-invalid': true });
	expect(mockKeypad.labelledBy).toBe('label-id');
	expect(mockKeypad.invalid).toBe(true);
	act(() => handle.current?.focus());
	expect(mockFocus).toHaveBeenCalledTimes(1);
	act(() => mockKeypad.onOpenChange(true));
	expect(handle.current?.isFocused()).toBe(true);
	act(() => handle.current?.blur());
	expect(mockDismiss).toHaveBeenCalledTimes(1);
});

it('a scanner burst while the keypad is open dismisses it, keeping the stored number', () => {
	// Stands in for the route's wedge detector, registered first: it marks a latched key.
	const detector = (event: KeyboardEvent) => event.preventDefault();
	document.addEventListener('keydown', detector, true);
	mockDismiss.mockClear();
	renderField({});
	act(() => mockKeypad.onOpenChange(true));
	for (const key of ['1', '2'])
		document.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
	document.removeEventListener('keydown', detector, true);
	expect(mockDismiss).toHaveBeenCalled();
	expect(onCommit).not.toHaveBeenCalled();
});
