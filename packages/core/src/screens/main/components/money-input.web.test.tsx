/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { MoneyInput } from './money-input.web';

type MockKeypadProps = {
	value: number;
	decimals: number;
	decimalSeparator: string;
	discounts?: number[];
	labels: { discount: (percent: number) => string; discountKey: (percent: number) => string };
	onOpenChange: (open: boolean) => void;
	ref: React.Ref<{ focus: () => void; dismiss: () => void }>;
};
let mockKeypad: MockKeypadProps;
const mockDismiss = jest.fn();
jest.mock('@wcpos/components/price-keypad', () => ({
	PriceKeypad: (props: MockKeypadProps) => {
		mockKeypad = props;
		jest.requireActual('react').useImperativeHandle(props.ref, () => ({
			focus: jest.fn(),
			dismiss: mockDismiss,
		}));
		return null;
	},
}));
jest.mock('../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string, options?: { percent: number }) =>
		options ? `${key}:${options.percent}` : key,
}));
// A store that prices to three places with a ',' separator and four-character barcodes.
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (store: Record<string, unknown>) => unknown) =>
		select({ price_decimal_sep: ',', price_num_decimals: 3, barcode_scanning_min_chars: 4 }),
}));

const renderInput = () =>
	render(<MoneyInput value="3.2" format={String} discounts={[5, 10]} onChangeText={jest.fn()} />);

it("hands the keypad the store's places and separator, and names the quick keys", () => {
	renderInput();
	expect(mockKeypad.value).toBe(3.2);
	expect(mockKeypad.decimals).toBe(3);
	expect(mockKeypad.decimalSeparator).toBe(',');
	expect(mockKeypad.discounts).toEqual([5, 10]);
	expect(mockKeypad.labels.discount(10)).toBe('pos_cart.discount_percent:10');
	// The store's number format: a comma store reads 12,5.
	expect(mockKeypad.labels.discount(12.5)).toBe('pos_cart.discount_percent:12,5');
	expect(mockKeypad.labels.discountKey(12.5)).toBe('−12,5%');
});

describe('a scanner burst', () => {
	const detector = (event: KeyboardEvent) => {
		if (event.key !== 'first') event.preventDefault();
	};
	const burst = () => {
		for (const name of ['first', '1', '2', '3']) {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: name, cancelable: true }));
		}
	};
	beforeEach(() => {
		mockDismiss.mockClear();
		document.addEventListener('keydown', detector, true);
		renderInput();
	});
	afterEach(() => document.removeEventListener('keydown', detector, true));

	it('while the keypad is open dismisses it', () => {
		act(() => mockKeypad.onOpenChange(true));
		burst();
		expect(mockDismiss).toHaveBeenCalledTimes(1);
	});

	it('after it has closed does nothing: the listener is gone', () => {
		act(() => mockKeypad.onOpenChange(true));
		act(() => mockKeypad.onOpenChange(false));
		burst();
		expect(mockDismiss).not.toHaveBeenCalled();
	});
});
