/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { QuickDiscountKeys } from './quick-discount-keys';

import type { AmountFieldProps } from '../../components/amount-field';

// The slots are the amount field's (its own tests cover the keypad and the commit rule): what is
// under test is which number each slot holds and what a slot's commit or remove writes.
const mockSlots: Record<string, AmountFieldProps> = {};
jest.mock('../../components/amount-field', () => ({
	AmountField: (props: AmountFieldProps) => {
		mockSlots[props.testID!] = props;
		return <span data-testid={props.testID}>{props.value ?? '–'}</span>;
	},
}));
jest.mock('@wcpos/components/price-keypad', () => ({ QUICK_KEYS: 3 }));
jest.mock('react-native', () => ({
	View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/form/aria', () => ({
	useFormControlAria: () => ({ itemNativeID: 'item', labelNativeID: 'label', ariaProps: {} }),
}));
jest.mock('@wcpos/components/form/common', () => ({
	FormItem: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	FormLabel: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
	FormDescription: ({ className, children }: React.PropsWithChildren<{ className?: string }>) => (
		<p data-testid="help" className={className}>
			{children}
		</p>
	),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

const onChange = jest.fn();
const renderKeys = (value: number[] | string | undefined) =>
	render(
		<QuickDiscountKeys value={value} onChange={onChange} label="Quick Discounts" testID="qd" />
	);
const slot = (index: number) => mockSlots[`qd-${index}`];
const shown = () => [0, 1, 2].map((index) => screen.getByTestId(`qd-${index}`).textContent);

beforeEach(() => onChange.mockReset());

it('draws three slots, as percent keys, the ones past the setting blank', () => {
	renderKeys([5, 10]);
	expect(shown()).toEqual(['5', '10', '–']);
	expect(slot(0)).toMatchObject({ kind: 'percent', look: 'key' });
	expect(screen.getByTestId('help').textContent).toBe('pos_cart.quick_discounts_help');
});

it("reads a legacy comma list as the cart's keypads do, three at most", () => {
	renderKeys('5,10,15,20');
	expect(shown()).toEqual(['5', '10', '15']);
});

it('a commit on a blank slot writes the keys with it, in slot order', () => {
	renderKeys([5, 10]);
	act(() => void slot(2).onCommit(12.5));
	expect(onChange).toHaveBeenCalledWith([5, 10, 12.5]);
});

it('a removed slot (a typed 0) drops out of what is written', () => {
	renderKeys([5, 10, 15]);
	act(() => slot(0).onRemove!());
	expect(onChange).toHaveBeenCalledWith([10, 15]);
});

it('above 100 is refused with the sentence, until the next accepted commit', () => {
	renderKeys([5, 10, 15]);
	let result: unknown;
	act(() => {
		result = slot(1).onCommit(150);
	});
	expect(result).toBe(false);
	expect(onChange).not.toHaveBeenCalled();
	expect(screen.getByTestId('help').textContent).toBe('pos_cart.discount_percent_invalid');
	expect(screen.getByTestId('help').className).toContain('text-bad');
	expect(slot(1).value).toBe(10);
	expect(slot(1)['aria-invalid']).toBe(true);

	act(() => void slot(1).onCommit(20));
	expect(onChange).toHaveBeenCalledWith([5, 20, 15]);
	expect(screen.getByTestId('help').textContent).toBe('pos_cart.quick_discounts_help');
});

it('with every slot blank, the help says the keypad shows the digits only', () => {
	renderKeys([]);
	expect(shown()).toEqual(['–', '–', '–']);
	expect(screen.getByTestId('help').textContent).toBe('pos_cart.quick_discounts_none');
});
