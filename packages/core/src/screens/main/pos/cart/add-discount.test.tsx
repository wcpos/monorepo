/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AddDiscount } from './add-discount';
import { AddFee } from './add-fee';
import { EditFeeLineForm } from './cells/edit-fee-line/form';
import { FeePrice } from './cells/fee-price';

const mockAdd = jest.fn();
const mockFee = jest.fn();
const mockUpdate = jest.fn();
const mockClose = jest.fn();
let mockPercent = false;
let mockFeeAmount = '10';

// FeePrice's read-only branch formats in the order's currency and the store's separators;
// app-state is not under test.
jest.mock('../../hooks/use-current-order-currency-format', () => ({
	useCurrentOrderCurrencyFormat: () => ({ format: (value: number) => String(value) }),
}));
jest.mock('../../hooks/use-number-format', () => ({
	useNumberFormat: () => ({ format: (value: number) => String(value) }),
}));
jest.mock('@wcpos/components/dialog', () => ({
	DialogAction: ({
		children,
		onPress,
		testID,
		disabled,
	}: React.PropsWithChildren<{
		onPress: () => void;
		testID?: string;
		disabled?: boolean;
	}>) => (
		<button data-testid={testID ?? 'submit'} onClick={onPress} disabled={disabled}>
			{children}
		</button>
	),
	DialogClose: () => null,
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter,
	useDialog: () => ({ close: mockClose }),
}));
jest.mock('@wcpos/components/form', () => {
	const { FormProvider, Controller } = jest.requireActual('react-hook-form');
	return {
		Form: FormProvider,
		useFormChangeHandler: jest.requireActual('@wcpos/components/form/use-form-change-handler')
			.useFormChangeHandler,
		SavedFieldProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
		SavedMark: () => null,
		useMarkSaved: () => jest.fn(),
		useSavedName: () => '',
		FormItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
		FormLabel: ({ children }: React.PropsWithChildren) => <>{children}</>,
		FormField: Controller,
		FormInput: ({
			customComponent: Component,
			value,
			onChange,
			testID,
			label,
			type,
		}: {
			customComponent?: React.ElementType;
			value: string | number;
			onChange: (v: string | number) => void;
			testID?: string;
			label: string;
			type?: string;
		}) =>
			Component ? (
				<Component
					value={value}
					testID={testID ?? label}
					onChangeText={(v: string | number) =>
						onChange(type === 'numeric' ? Number(v) : String(v))
					}
				/>
			) : (
				<input
					data-testid={testID}
					value={value ?? ''}
					onChange={(e) => onChange(e.target.value)}
				/>
			),
		FormSwitch: ({
			value,
			onChange,
			testID,
		}: {
			value: boolean;
			onChange: (v: boolean) => void;
			testID: string;
		}) => (
			<input
				type="checkbox"
				data-testid={testID}
				checked={value}
				onChange={(e) => onChange(e.target.checked)}
			/>
		),
		FormSelect: () => null,
		FormRadioGroup: () => null,
	};
});
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/property-row', () => ({
	PropertyList: ({ children }: React.PropsWithChildren) => <>{children}</>,
	PropertyAddRow: ({ children }: React.PropsWithChildren) => <>{children}</>,
	PropertyAdd: () => null,
	PropertyRow: ({
		label,
		children,
		trailing,
	}: React.PropsWithChildren<{ label: string; trailing?: React.ReactNode }>) => (
		<div>
			<span>{label}</span>
			{children}
			{trailing}
		</div>
	),
}));
// The select's options as a native select: a change picks that option's value.
jest.mock('@wcpos/components/select', () => ({
	OptionSelect: ({
		options,
		value,
		onChange,
		triggerTestID,
	}: {
		options: { value: string; label: string }[];
		value?: string;
		onChange: (value: string) => void;
		triggerTestID?: string;
	}) => (
		<select data-testid={triggerTestID} value={value} onChange={(e) => onChange(e.target.value)}>
			{options.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	),
}));
// The real control's segments as buttons: a press on a segment's testID selects that segment.
jest.mock('@wcpos/components/segmented-control', () => ({
	SegmentedControl: ({
		segments,
		value,
		onValueChange,
		...props
	}: {
		segments: { value: string; label: string; testID?: string }[];
		value: string;
		onValueChange: (value: string) => void;
		'aria-labelledby'?: string;
	}) => (
		<div role="radiogroup" aria-labelledby={props['aria-labelledby']}>
			{segments.map((segment) => (
				<button
					key={segment.value}
					role="radio"
					aria-checked={segment.value === value}
					data-testid={segment.testID}
					onClick={() => onValueChange(segment.value)}
				>
					{segment.label}
				</button>
			))}
		</div>
	),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '$', currency: 'USD' }),
}));
jest.mock('../../components/form-errors', () => ({
	FormErrors: () => {
		const { errors } = jest.requireActual('react-hook-form').useFormState();
		return (
			<div>
				{Object.values(errors)
					.map((e) => (e as { message?: string }).message)
					.join('; ')}
			</div>
		);
	},
}));
jest.mock('../../components/number-input', () => ({
	NumberInput: ({
		value,
		onChangeText,
		testID,
	}: {
		value: string;
		onChangeText: (v: number) => void;
		testID?: string;
	}) => (
		<input
			data-testid={testID ?? 'price'}
			value={value}
			onChange={(e) => onChangeText(Number(e.target.value))}
		/>
	),
}));
jest.mock('../../components/currency-input', () => ({
	CurrencyInput: (props: object) => {
		const { NumberInput } = jest.requireMock('../../components/number-input');
		return <NumberInput {...props} />;
	},
}));
// The cart cell's in-place editor, open: the field and the cell's own commit.
jest.mock('../../components/editable-number', () => ({
	EditableNumber: (props: object) => {
		const { NumberInput } = jest.requireMock('../../components/number-input');
		return <NumberInput {...props} />;
	},
}));
jest.mock('../../components/tax-class-select', () => ({
	TaxClassSelect: () => null,
	useTaxClassOptions: () => [
		{ label: 'Standard', value: 'standard' },
		{ label: 'Reduced rate', value: 'reduced-rate' },
	],
}));
jest.mock('../../components/tax-status-radio-group', () => ({ TaxStatusRadioGroup: () => null }));
jest.mock('../../components/meta-data-form', () => ({
	MetaDataForm: () => null,
	metaDataSchema: jest.requireActual('zod').array(jest.requireActual('zod').unknown()),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../hooks/use-add-quick-discount', () => ({
	useAddQuickDiscount: () => ({ addQuickDiscount: mockAdd }),
}));
jest.mock('../hooks/use-add-fee', () => ({ useAddFee: () => ({ addFee: mockFee }) }));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-1' } }),
}));
jest.mock('../hooks/use-update-cart-line', () => ({
	useUpdateCartLine: () => ({ updateCartLine: mockUpdate }),
}));
jest.mock('../hooks/use-fee-line-data', () => ({
	useFeeLineData: () => ({
		getFeeLineData: () => ({
			amount: mockFeeAmount,
			percent: mockPercent,
			prices_include_tax: true,
		}),
	}),
}));

beforeEach(() => {
	jest.clearAllMocks();
	mockPercent = false;
	mockFeeAmount = '10';
	mockAdd.mockResolvedValue({ success: true });
});
it.each([
	[false, '0', 'Enter an amount greater than zero'],
	[false, '-5', 'Enter an amount greater than zero'],
	[true, '0', 'Enter a percentage above 0 and up to 100'],
	[true, '-5', 'Enter a percentage above 0 and up to 100'],
	[true, '101', 'Enter a percentage above 0 and up to 100'],
])('rejects percent=%p amount=%s', async (percent, amount, message) => {
	render(<AddDiscount />);
	if (percent) fireEvent.click(screen.getByTestId('discount-percent-switch'));
	fireEvent.change(screen.getByTestId('discount-amount-input'), { target: { value: amount } });
	fireEvent.click(screen.getByTestId('add-discount-submit'));
	await screen.findByText(message);
	expect(mockAdd).not.toHaveBeenCalled();
	expect(mockClose).not.toHaveBeenCalled();
});
it.each([
	[false, '0010.0100', '10.01', 'fixed_cart'],
	[true, '010.00', '10', 'percent'],
	[true, '100', '100', 'percent'],
])('submits normalized intent: %p %s', async (percent, amount, normalized, type) => {
	render(<AddDiscount />);
	if (percent) fireEvent.click(screen.getByTestId('discount-percent-switch'));
	fireEvent.change(screen.getByTestId('discount-amount-input'), { target: { value: amount } });
	fireEvent.click(screen.getByTestId('add-discount-submit'));
	await waitFor(() =>
		expect(mockAdd).toHaveBeenCalledWith({ discount_type: type, amount: normalized })
	);
	await waitFor(() => expect(mockClose).toHaveBeenCalledWith());
});
it("Add Discount's unit is the amount row's toggle: the store's symbol, then %", async () => {
	render(<AddDiscount />);
	expect(screen.getAllByRole('radio').map((segment) => segment.textContent)).toEqual(['$', '%']);
	// The group is named by the row's key, not by a label of its own.
	expect(screen.getByRole('radiogroup').getAttribute('aria-labelledby')).toBe(
		'discount-amount-form-item'
	);
	fireEvent.click(screen.getByTestId('discount-percent-switch'));
	expect(screen.getByTestId('discount-percent-switch').getAttribute('aria-checked')).toBe('true');
});
it('keeps the dialog open and shows a failed application', async () => {
	mockAdd.mockResolvedValue({ success: false, error: 'cart changed' });
	render(<AddDiscount />);
	fireEvent.change(screen.getByTestId('discount-amount-input'), { target: { value: '10' } });
	fireEvent.click(screen.getByTestId('add-discount-submit'));
	await screen.findByText('cart changed');
	expect(mockClose).not.toHaveBeenCalled();
});
it.each(['add', 'edit'])('rejects negative fees in the %s form', async (mode) => {
	render(
		mode === 'add' ? (
			<AddFee />
		) : (
			<EditFeeLineForm uuid="fee" item={{ name: 'Fee', meta_data: [] }} />
		)
	);
	fireEvent.change(
		screen.getByTestId(mode === 'add' ? 'fee-amount-input' : 'edit-fee-line-amount-input'),
		{
			target: { value: '-5' },
		}
	);
	if (mode === 'add') fireEvent.click(screen.getByTestId('add-to-cart-submit'));
	await screen.findByText('A fee cannot be negative. Use Add Discount instead.');
	expect(mockFee).not.toHaveBeenCalled();
	expect(mockUpdate).not.toHaveBeenCalled();
});
it.each([false, true])(
	'ignores a negative fee price so a legacy discount fee is never rewritten, percent=%p',
	(percent) => {
		mockPercent = percent;
		mockFeeAmount = '-10';
		const props = { row: { original: { item: {}, uuid: 'fee' } } } as React.ComponentProps<
			typeof FeePrice
		>;
		render(<FeePrice {...props} />);
		expect((screen.getByTestId('cart-fee-price') as HTMLInputElement).value).toBe('-10');
		// The input re-emits its own value on blur: a legacy negative fee must survive that.
		fireEvent.change(screen.getByTestId('cart-fee-price'), { target: { value: '-10' } });
		fireEvent.change(screen.getByTestId('cart-fee-price'), { target: { value: '-5' } });
		expect(mockUpdate).not.toHaveBeenCalled();
		fireEvent.change(screen.getByTestId('cart-fee-price'), { target: { value: '5' } });
		expect(mockUpdate).toHaveBeenCalledWith('fee_lines', 'fee', { amount: '5' });
	}
);

describe('Add Fee', () => {
	it('is four rows: Fee name, Amount, Amount includes tax, Tax', () => {
		render(<AddFee />);
		for (const label of ['Fee Name', 'Amount', 'Amount Includes Tax', 'Tax'])
			expect(screen.getByText(label)).toBeTruthy();
		expect(screen.getByTestId('fee-name-input')).toBeTruthy();
		expect(screen.getByTestId('fee-includes-tax-switch')).toBeTruthy();
		expect((screen.getByTestId('fee-tax-select') as HTMLSelectElement).value).toBe(
			'class:standard'
		);
	});
	it("the amount row's % segment makes the fee a percentage", async () => {
		render(<AddFee />);
		fireEvent.click(screen.getByTestId('fee-percent-switch'));
		expect(screen.getByTestId('fee-percent-switch').getAttribute('aria-checked')).toBe('true');
		fireEvent.change(screen.getByTestId('fee-amount-input'), { target: { value: '5' } });
		fireEvent.click(screen.getByTestId('add-to-cart-submit'));
		await waitFor(() =>
			expect(mockFee).toHaveBeenCalledWith(expect.objectContaining({ amount: '5', percent: true }))
		);
	});
	it('Not taxable writes tax_status none and leaves the class', async () => {
		render(<AddFee />);
		fireEvent.change(screen.getByTestId('fee-tax-select'), { target: { value: 'status:none' } });
		fireEvent.click(screen.getByTestId('add-to-cart-submit'));
		await waitFor(() =>
			expect(mockFee).toHaveBeenCalledWith(
				expect.objectContaining({ tax_status: 'none', tax_class: '' })
			)
		);
	});
	it('a class makes the fee taxable in that class', async () => {
		render(<AddFee />);
		fireEvent.change(screen.getByTestId('fee-tax-select'), { target: { value: 'status:none' } });
		fireEvent.change(screen.getByTestId('fee-tax-select'), {
			target: { value: 'class:reduced-rate' },
		});
		fireEvent.click(screen.getByTestId('add-to-cart-submit'));
		await waitFor(() =>
			expect(mockFee).toHaveBeenCalledWith(
				expect.objectContaining({ tax_status: 'taxable', tax_class: 'reduced-rate' })
			)
		);
	});
});
