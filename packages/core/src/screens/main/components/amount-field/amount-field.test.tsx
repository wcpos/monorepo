/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';

import * as InputModule from '@wcpos/components/input';
import { FormFieldContext } from '@wcpos/components/form/context';

import { AmountField, FormAmountField } from './index';

import type { AmountFieldProps } from './types';

// The interface is the test surface: the NATIVE adapter (Jest resolves it), the commit rule and
// the store's separators and places, which `use-amount` reads once for both adapters.

// next's Input renders the Uniwind/SVG icon, whose ESM builds jest cannot load.
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('../../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
const mockStore = {
	decimal_qty: true,
	price_decimal_sep: '.',
	price_thousand_sep: ',',
	price_num_decimals: 2,
	thousands_group_style: 'thousand',
	currency: 'USD',
	currency_pos: 'left',
};
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (store: typeof mockStore) => unknown) => select(mockStore),
	useRecordField: () => undefined,
}));

afterEach(() => {
	mockStore.price_decimal_sep = '.';
	mockStore.price_thousand_sep = ',';
	mockStore.price_num_decimals = 2;
});

function field(props: Partial<AmountFieldProps> = {}) {
	const onCommit = jest.fn();
	const utils = render(
		<AmountField kind="money" testID="amount" value={5} onCommit={onCommit} {...props} />
	);
	return { onCommit, input: () => screen.getByTestId('amount') as HTMLInputElement, ...utils };
}

function type(input: HTMLInputElement, text: string) {
	fireEvent.focus(input);
	fireEvent.change(input, { target: { value: text } });
	fireEvent.blur(input);
}

describe('places: each kind commits at its own, whatever was typed', () => {
	it.each([
		// [kind, typed, committed]
		['money', '3.456', 3.46], // the store's price places (2)
		['percent', '12.555', 12.56], // hundredths, whatever the currency's places
		['quantity', '0.1234567', 0.123457], // a line's six places
		['count', '2.5', 3], // whole: native has no keypad to stop the fraction (stock)
	] as const)('%s: typed %s commits %d', (kind, typed, committed) => {
		const { onCommit, input } = field({ kind, value: 1 });
		type(input(), typed);
		expect(onCommit).toHaveBeenCalledWith(committed);
	});

	it("money takes its own places over the store's (a refund's)", () => {
		mockStore.price_num_decimals = 0;
		const { onCommit, input } = field({ places: 2 });
		type(input(), '1.255');
		expect(onCommit).toHaveBeenCalledWith(1.26);
	});
});

describe("separators: typed or pasted text reads with the store's", () => {
	it.each([
		// [decimal, thousands, typed, committed]
		['.', ',', '1,234.50', 1234.5], // both separators: the thousands one is grouping
		[',', '.', '1.234,50', 1234.5], // the same on a comma store
		[',', '.', '1,5', 1.5], // a single comma is the decimal on a comma store
		[',', '.', '9.99', 9.99], // a single dot is a decimal on a comma store (fr_FR E2E types '.')
		['.', ',', '1,5', 1.5], // and a single comma on a dot store
		['.', ',', '1,234,567', 1234567], // a separator twice is grouping
		[',', ' ', '1 234,50', 1234.5], // a space thousands separator is never a decimal
		['.', ',', '-12.5', -12.5],
	])('decimal %s, thousands %s: %s commits %d', (decimal, thousands, typed, committed) => {
		mockStore.price_decimal_sep = decimal;
		mockStore.price_thousand_sep = thousands;
		const { onCommit, input } = field({ value: 1 });
		type(input(), typed);
		expect(onCommit).toHaveBeenCalledWith(committed);
	});

	it.each(['1.2.3,4', '12abc', '1,2,3.4.5'])(
		'%s is unreadable: nothing is written and the stored number shows again',
		(typed) => {
			const { onCommit, input } = field();
			type(input(), typed);
			expect(onCommit).not.toHaveBeenCalled();
			expect(input().value).toBe('5');
		}
	);

	it('a comma store shows 12,5 and edits 12,5', () => {
		mockStore.price_decimal_sep = ',';
		mockStore.price_thousand_sep = '.';
		const { onCommit, input } = field({ kind: 'percent', value: 12.5 });
		expect(input().value).toBe('12,5');
		type(input(), '12,75');
		expect(onCommit).toHaveBeenCalledWith(12.75);
	});
});

describe('commit, cancel, no-op', () => {
	it('a focus and leave writes nothing; retyping the stored number writes nothing', () => {
		const { onCommit, input } = field({ value: '3.2' });
		fireEvent.focus(input());
		fireEvent.blur(input());
		type(input(), '3.20');
		expect(onCommit).not.toHaveBeenCalled();
		type(input(), '3.5');
		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit).toHaveBeenCalledWith(3.5);
	});

	it('a field removed while focused lands its draft once, before the form unsubscribes', () => {
		const written = jest.fn();
		function Page() {
			const form = useForm({ defaultValues: { count: 8 } });
			// As useFormChangeHandler subscribes: a passive effect in the page that unmounts with it.
			React.useEffect(() => {
				const sub = form.watch((values, { name }) => name && written(values.count));
				return () => sub.unsubscribe();
			}, [form]);
			return (
				<FormProvider {...form}>
					<FormFieldContext.Provider value={{ name: 'count' }}>
						<Controller
							control={form.control}
							name="count"
							render={({ field }) => <FormAmountField kind="count" testID="amount" {...field} />}
						/>
					</FormFieldContext.Provider>
				</FormProvider>
			);
		}
		const { unmount } = render(<Page />);
		const input = screen.getByTestId('amount') as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: '12' } });
		unmount();
		expect(written).toHaveBeenCalledTimes(1);
		expect(written).toHaveBeenCalledWith(12);
	});

	it('a field whose row is removed (the form clears it, then it unmounts) drops its draft', () => {
		const written = jest.fn();
		function Page() {
			const form = useForm({ defaultValues: { sale: 5 as number | string } });
			const [shown, setShown] = React.useState(true);
			React.useEffect(() => {
				const sub = form.watch((values, { name }) => name && written(values.sale));
				return () => sub.unsubscribe();
			}, [form]);
			return (
				<FormProvider {...form}>
					<FormFieldContext.Provider value={{ name: 'sale' }}>
						{shown && (
							<Controller
								control={form.control}
								name="sale"
								render={({ field }) => <FormAmountField kind="money" testID="amount" {...field} />}
							/>
						)}
						<button
							data-testid="remove"
							onClick={() => {
								setShown(false);
								form.setValue('sale', '', { shouldDirty: true });
							}}
						/>
					</FormFieldContext.Provider>
				</FormProvider>
			);
		}
		render(<Page />);
		const input = screen.getByTestId('amount') as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: '4' } });
		fireEvent.click(screen.getByTestId('remove'));
		expect(written.mock.calls).toEqual([['']]);
	});

	it('a field blurred, then removed, does not land its draft twice', () => {
		const { onCommit, input, unmount } = field({ value: '3' });
		type(input(), '4');
		unmount();
		expect(onCommit).toHaveBeenCalledTimes(1);
	});

	it('Escape puts the stored number back and writes nothing', () => {
		const { onCommit, input } = field();
		fireEvent.focus(input());
		fireEvent.change(input(), { target: { value: '9' } });
		fireEvent.keyDown(input(), { key: 'Escape' });
		fireEvent.blur(input());
		expect(onCommit).not.toHaveBeenCalled();
		expect(input().value).toBe('5');
	});

	it('a blank money rests blank and a focus and leave writes no 0; a typed 0 writes 0, once', () => {
		const { onCommit, input } = field({ value: '' });
		expect(input().value).toBe('');
		fireEvent.focus(input());
		fireEvent.blur(input());
		expect(onCommit).not.toHaveBeenCalled();
		type(input(), '0');
		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit).toHaveBeenCalledWith(0);
	});

	it("a quantity committed as 0 is its line's remove, never a 0 write", () => {
		const onRemove = jest.fn();
		const { onCommit, input } = field({ kind: 'quantity', value: 2, onRemove });
		type(input(), '0');
		expect(onRemove).toHaveBeenCalledTimes(1);
		expect(onCommit).not.toHaveBeenCalled();
	});

	it('onDraftChange hears each readable draft, at the places, before any commit', () => {
		const onDraftChange = jest.fn();
		const { onCommit, input } = field({ onDraftChange });
		fireEvent.focus(input());
		fireEvent.change(input(), { target: { value: '7.125' } });
		fireEvent.change(input(), { target: { value: '7.1x' } });
		fireEvent.change(input(), { target: { value: '' } });
		// Unreadable is null and blank is undefined, never the last readable draft kept.
		expect(onDraftChange.mock.calls).toEqual([[7.13], [null], [0]]);
		expect(onCommit).not.toHaveBeenCalled();
	});
});

describe('the field keeps what is typed (#1957)', () => {
	it('replaces the native field when the value changes while unfocused, never while focused', () => {
		const { rerender, input, onCommit } = field({ kind: 'quantity', value: 18 });
		const first = input();
		rerender(<AmountField kind="quantity" testID="amount" value={1} onCommit={onCommit} />);
		expect(input()).not.toBe(first);
		expect(input().value).toBe('1');

		const focused = input();
		fireEvent.focus(focused);
		fireEvent.change(focused, { target: { value: '7' } });
		rerender(<AmountField kind="quantity" testID="amount" value={5} onCommit={onCommit} />);
		expect(input()).toBe(focused);
		expect(focused.value).toBe('7');
		fireEvent.blur(focused);
		expect(onCommit).toHaveBeenCalledWith(7);
	});
});

describe('quiet: a grid cell edits in place', () => {
	it('rests as the cell text, opens to the field on a press, and leaving commits and closes', () => {
		const { onCommit } = field({ look: 'quiet', value: 12.5 });
		expect(screen.getByText('$12.50')).toBeTruthy();
		fireEvent.click(screen.getByTestId('amount'));
		const input = screen.getByTestId('amount-field') as HTMLInputElement;
		expect(input.value).toBe('12.5');
		type(input, '13');
		expect(onCommit).toHaveBeenCalledWith(13);
		expect(screen.queryByTestId('amount-field')).toBeNull();
	});

	it('a blank price rests as –, never 0.00', () => {
		field({ look: 'quiet', value: '' });
		expect(screen.getByText('–')).toBeTruthy();
	});
});

it('key: a Quick Discounts slot is the typed field on native, a percentage at its places', () => {
	const { onCommit, input } = field({ kind: 'percent', look: 'key', value: 10 });
	expect(input().tagName).toBe('INPUT');
	expect(input().value).toBe('10');
	type(input(), '12.5');
	expect(onCommit).toHaveBeenCalledWith(12.5);
});

describe('FormAmountField hands the form the number in the form’s own type', () => {
	function Harness({ initial, live }: { initial: string | number; live?: boolean }) {
		const form = useForm({ defaultValues: { amount: initial } });
		const amount = useWatch({ control: form.control, name: 'amount' });
		return (
			<FormProvider {...form}>
				<FormFieldContext.Provider value={{ name: 'amount' }}>
					<Controller
						control={form.control}
						name="amount"
						render={({ field }) => (
							<FormAmountField kind="money" live={live} testID="amount" {...field} />
						)}
					/>
				</FormFieldContext.Provider>
				<span data-testid="held">{`${typeof amount}:${amount}`}</span>
			</FormProvider>
		);
	}

	it.each([
		['0', 'string:12.5'], // WooCommerce's strings stay strings
		[0, 'number:12.5'],
	] as const)('a form holding %p gets %s', (initial, held) => {
		render(<Harness initial={initial} />);
		type(screen.getByTestId('amount') as HTMLInputElement, '12.5');
		expect(screen.getByTestId('held').textContent).toBe(held);
	});

	it('live: an unreadable draft leaves the form a null its schema refuses, not the last amount', () => {
		render(<Harness initial="" live />);
		const input = screen.getByTestId('amount') as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: '5' } });
		expect(screen.getByTestId('held').textContent).toBe('string:5');
		fireEvent.change(input, { target: { value: '.' } });
		expect(screen.getByTestId('held').textContent).toBe('object:null');
		fireEvent.change(input, { target: { value: '' } });
		expect(screen.getByTestId('held').textContent).toBe('string:');
		fireEvent.change(input, { target: { value: '6' } });
		expect(screen.getByTestId('held').textContent).toBe('string:6');
	});
});

it('keeps the cart control radius when the native quantity needs attention', () => {
	const input = jest
		.spyOn(InputModule, 'Input')
		.mockImplementation((props) => (
			<input data-testid={props.testID} className={props.className} />
		));
	try {
		field({ kind: 'quantity', tone: 'attention', className: 'rounded-control' });
		const classes = screen.getByTestId('amount').className.split(' ');
		expect(classes).toContain('rounded-control');
		expect(classes).not.toContain('rounded-field');
		expect(classes).toContain('border-attention');
	} finally {
		input.mockRestore();
	}
});
