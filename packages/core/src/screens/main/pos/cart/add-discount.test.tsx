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
	DialogFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
	useRootContext: () => ({ onOpenChange: mockClose }),
}));
jest.mock('@wcpos/components/form', () => {
	const { FormProvider, Controller } = jest.requireActual('react-hook-form');
	return {
		Form: FormProvider,
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
				<input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
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
jest.mock('../../components/tax-class-select', () => ({ TaxClassSelect: () => null }));
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
jest.mock('../hooks/use-update-fee-line', () => ({
	useUpdateFeeLine: () => ({ updateFeeLine: mockUpdate }),
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
	await waitFor(() => expect(mockClose).toHaveBeenCalledWith(false));
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
	fireEvent.change(screen.getByTestId(mode === 'add' ? 'fee-amount-input' : 'Amount'), {
		target: { value: '-5' },
	});
	fireEvent.click(screen.getByTestId(mode === 'add' ? 'add-to-cart-submit' : 'submit'));
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
		expect((screen.getByTestId('price') as HTMLInputElement).value).toBe('-10');
		// The input re-emits its own value on blur: a legacy negative fee must survive that.
		fireEvent.change(screen.getByTestId('price'), { target: { value: '-10' } });
		fireEvent.change(screen.getByTestId('price'), { target: { value: '-5' } });
		expect(mockUpdate).not.toHaveBeenCalled();
		fireEvent.change(screen.getByTestId('price'), { target: { value: '5' } });
		expect(mockUpdate).toHaveBeenCalledWith('fee', { amount: '5' });
	}
);
