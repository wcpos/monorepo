/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { CouponForm, type couponFormSchema } from './coupon-form';

import type * as z from 'zod';

type Field = {
	value?: unknown;
	onChange: (value: unknown) => void;
	testID?: string;
	placeholder?: string;
};

jest.mock('@wcpos/components/form', () => {
	const { FormProvider, Controller } = jest.requireActual('react-hook-form');
	return {
		Form: FormProvider,
		FormField: Controller,
		FormItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
		FormMessage: () => null,
		FormInput: ({ value, onChange, testID, placeholder }: Field) => (
			<input
				data-testid={testID}
				aria-label={placeholder}
				value={String(value ?? '')}
				onChange={(event) => onChange(event.target.value)}
			/>
		),
		FormSwitch: ({ value, onChange, testID }: Field) => (
			<input
				type="checkbox"
				data-testid={testID}
				checked={!!value}
				onChange={(event) => onChange(event.target.checked)}
			/>
		),
		FormSegmentedControl: ({
			segments,
			onChange,
			testID,
		}: Field & { segments: { value: string }[] }) =>
			segments.map((segment) => (
				<button
					key={segment.value}
					data-testid={`${testID}-${segment.value}`}
					onClick={() => onChange(segment.value)}
				/>
			)),
		FormSelect: () => null,
		SavedMark: () => null,
		useSavedName: () => '',
	};
});
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: () => <div data-testid="collapsible" />,
	CollapsibleContent: () => null,
	CollapsibleTrigger: () => null,
}));
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: () => null,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/button', () => ({ Button: () => null, ButtonText: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/tooltip', () => ({}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../components/amount-field', () => ({
	AmountField: () => null,
	FormAmountField: () => null,
}));
jest.mock('./discount-amount-input', () => ({ DiscountAmountInput: () => null }));
jest.mock('./expiry-preset-chips', () => ({ ExpiryPresetChips: () => null }));
jest.mock('../form-errors', () => ({ FormErrors: () => null }));

type Values = z.infer<typeof couponFormSchema>;
const harness: { form?: UseFormReturn<Values> } = {};
function Harness({ values }: { values?: Partial<Values> }) {
	const form = useForm<Values>({
		defaultValues: { discount_type: 'percent', ...values } as Values,
	});
	React.useEffect(() => {
		harness.form = form;
	});
	return <CouponForm form={form} footer={{}} />;
}
const value = (name: keyof Values) => harness.form!.getValues(name);
const row = (name: string) => screen.queryByTestId(`coupon-row-${name}`);
const addButton = (name: string) => screen.queryByTestId(`coupon-add-${name}`);

it('a new coupon is its five asked rows and nine add buttons, with nothing folded', () => {
	render(<Harness />);
	for (const name of ['code', 'discount', 'expires', 'one_time_use', 'status']) {
		expect(row(name)).toBeTruthy();
	}
	expect(screen.getAllByTestId(/^coupon-add-/)).toHaveLength(9);
	expect(screen.queryByTestId('collapsible')).toBeNull();
});
it('a fact with a value is a row, not an add button', () => {
	render(<Harness values={{ minimum_amount: '10' }} />);
	expect(row('minimum_amount')).toBeTruthy();
	expect(addButton('minimum_amount')).toBeNull();
});
it('adding Total uses while One-time use is on turns one-time off and shows the empty row', () => {
	render(<Harness values={{ usage_limit: 1 }} />);
	expect(row('usage_limit')).toBeNull();
	fireEvent.click(addButton('usage_limit')!);
	expect(value('usage_limit')).toBe(0);
	expect(row('usage_limit')).toBeTruthy();
	expect((screen.getByTestId('coupon-one-time-use') as HTMLInputElement).checked).toBe(false);
});
it('turning One-time use on withdraws Total uses', () => {
	render(<Harness values={{ usage_limit: 5 }} />);
	expect(row('usage_limit')).toBeTruthy();
	fireEvent.click(screen.getByTestId('coupon-one-time-use'));
	expect(value('usage_limit')).toBe(1);
	expect(row('usage_limit')).toBeNull();
	expect(addButton('usage_limit')).toBeTruthy();
});
it('an added switch arrives on, and Remove turns it off and offers it again', () => {
	render(<Harness />);
	fireEvent.click(addButton('individual_use')!);
	expect(value('individual_use')).toBe(true);
	expect(addButton('individual_use')).toBeNull();
	fireEvent.click(screen.getByTestId('coupon-remove-individual_use'));
	expect(value('individual_use')).toBe(false);
	expect(row('individual_use')).toBeNull();
	expect(addButton('individual_use')).toBeTruthy();
});
it('Max discounted items is not offered for an amount off the order', () => {
	render(<Harness />);
	expect(addButton('limit_usage_to_x_items')).toBeTruthy();
	fireEvent.click(screen.getByTestId('coupon-discount-type-fixed_cart'));
	expect(addButton('limit_usage_to_x_items')).toBeNull();
});
it('Custom field appends an empty custom field row', () => {
	render(<Harness />);
	expect(screen.queryByTestId('coupon-row-meta-0')).toBeNull();
	fireEvent.click(addButton('meta_data')!);
	expect(screen.getByTestId('coupon-row-meta-0')).toBeTruthy();
	expect(value('meta_data')).toEqual([{ key: '', value: '' }]);
});
