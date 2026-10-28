/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { EditFeeLineForm } from './form';

const mockUpdate = jest.fn();
const mockMarkSaved = jest.fn();
function mockWrap({ children }: React.PropsWithChildren) {
	return <>{children}</>;
}
jest.mock('@wcpos/components/form', () => ({
	Form: jest.requireActual('react-hook-form').FormProvider,
	FormField: jest.requireActual('react-hook-form').Controller,
	useFormChangeHandler: jest.requireActual('@wcpos/components/form/use-form-change-handler')
		.useFormChangeHandler,
	SavedFieldProvider: mockWrap,
	SavedMark: () => null,
	useMarkSaved: () => mockMarkSaved,
	useSavedName: () => '',
	FormItem: mockWrap,
	FormLabel: mockWrap,
	FormInput: ({
		name,
		value,
		onChange,
	}: {
		name: string;
		value?: string;
		onChange: (value: string) => void;
	}) => <input aria-label={name} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />,
	FormSelect: () => null,
	FormSwitch: () => null,
	FormSegmentedControl: () => null,
}));
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: mockWrap,
	DialogFooter: jest.requireActual('../../../../../../../jest/footer.test-utils').DialogFooter,
	DialogClose: mockWrap,
	DialogAction: mockWrap,
	useDialog: () => ({ close: jest.fn() }),
}));
jest.mock('@wcpos/components/hstack', () => ({ HStack: mockWrap }));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
// A form's amount stands in as the form's own input mock: the rows are under test, not the field.
jest.mock('../../../../components/amount-field', () => ({
	AmountField: () => null,
	// The fee's amount is Woo's text in the form, as in Add fee: the field hands a text form text.
	FormAmountField: (props: object) => {
		const { FormInput } = jest.requireMock('@wcpos/components/form');
		return <FormInput {...props} />;
	},
}));
jest.mock('../../../../components/tax-select', () => ({ TaxSelect: () => null }));
jest.mock('../../../../components/amount-unit-toggle', () => ({ AmountUnitToggle: () => null }));
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../../../jest/property-row.test-utils')
);
jest.mock('../../../../components/meta-data-form', () => ({
	MetaDataForm: () => null,
	metaDataSchema: jest.requireActual('zod').array(jest.requireActual('zod').unknown()),
}));
jest.mock('../../../../components/form-errors', () => ({
	FormErrors: () => {
		const { errors } = jest.requireActual('react-hook-form').useFormState();
		return <span>{errors.amount?.message}</span>;
	},
}));
jest.mock('../../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-1' } }),
}));
jest.mock('../../../hooks/use-update-cart-line', () => ({
	useUpdateCartLine: () => ({ updateCartLine: mockUpdate }),
}));
jest.mock('../../../hooks/use-fee-line-data', () => ({
	useFeeLineData: () => ({
		getFeeLineData: () => ({
			amount: '10',
			percent: false,
			prices_include_tax: false,
			percent_of_cart_total_with_tax: false,
		}),
	}),
}));

beforeEach(() => {
	jest.clearAllMocks();
	mockUpdate.mockResolvedValue(true);
});
it('autosaves only the amount as a wire string and marks it saved', async () => {
	render(<EditFeeLineForm uuid="fee-1" item={{ name: 'Fee', meta_data: [] }} />);
	fireEvent.change(screen.getByRole('textbox', { name: 'amount' }), { target: { value: '12.5' } });
	await waitFor(() =>
		expect(mockUpdate).toHaveBeenCalledWith(
			'fee_lines',
			'fee-1',
			{ amount: '12.5' },
			{ record: { uuid: 'order-1' } }
		)
	);
	expect(mockMarkSaved).toHaveBeenCalledWith(['amount']);
});
it('rejects a negative amount without writing it', async () => {
	render(<EditFeeLineForm uuid="fee-1" item={{ name: 'Fee', meta_data: [] }} />);
	fireEvent.change(screen.getByRole('textbox', { name: 'amount' }), { target: { value: '-5' } });
	await screen.findByText('pos_cart.fee_amount_negative');
	expect(mockUpdate).not.toHaveBeenCalled();
	expect(mockMarkSaved).not.toHaveBeenCalled();
});
