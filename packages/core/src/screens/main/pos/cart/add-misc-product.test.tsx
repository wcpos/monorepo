/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AddMiscProduct } from './add-misc-product';

const mockAddProduct = jest.fn();
const mockClose = jest.fn();

jest.mock('@wcpos/components/dialog', () => ({
	DialogAction: ({
		children,
		onPress,
		testID,
		disabled,
	}: React.PropsWithChildren<{ onPress: () => void; testID?: string; disabled?: boolean }>) => (
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
		FormItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
		FormField: Controller,
		FormInput: ({
			customComponent: Component,
			value,
			onChange,
			testID,
		}: {
			customComponent?: React.ElementType;
			value: string;
			onChange: (v: string) => void;
			testID?: string;
		}) =>
			Component ? (
				<Component value={value} testID={testID} onChangeText={(v: string) => onChange(v)} />
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
		FormTreeCombobox: () => null,
	};
});
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
jest.mock('@wcpos/components/select', () => ({ OptionSelect: () => null }));
jest.mock('../../components/amount-field', () => ({
	FormAmountField: ({ value, testID }: { value: string; testID?: string }) => (
		<input data-testid={testID} value={value} readOnly />
	),
}));
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../components/product/category-select', () => ({ CategoryTreeLoader: () => null }));
jest.mock('../../components/tax-class-select', () => ({ useTaxClassOptions: () => [] }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../hooks/use-add-product', () => ({
	useAddProduct: () => ({ addProduct: mockAddProduct }),
}));

const OFFERED = ['sku', 'categories', 'virtual', 'downloadable'];

beforeEach(() => {
	jest.clearAllMocks();
	mockAddProduct.mockResolvedValue(undefined);
});

async function submitted() {
	fireEvent.click(screen.getByTestId('add-to-cart-submit'));
	await waitFor(() => expect(mockAddProduct).toHaveBeenCalledTimes(1));
	return mockAddProduct.mock.calls[0][0];
}

it('asks Name, Price and Tax and offers SKU, Categories, Virtual and Downloadable', () => {
	render(<AddMiscProduct />);
	for (const name of ['name', 'price', 'tax'])
		expect(screen.getByTestId(`misc-product-row-${name}`)).toBeTruthy();
	for (const name of OFFERED) {
		expect(screen.getByTestId(`misc-product-add-${name}`)).toBeTruthy();
		expect(screen.queryByTestId(`misc-product-row-${name}`)).toBeNull();
	}
	expect(screen.queryByTestId('misc-product-sku-input')).toBeNull();
});

it('Virtual arrives switched on and submits virtual: true', async () => {
	render(<AddMiscProduct />);
	fireEvent.click(screen.getByTestId('misc-product-add-virtual'));
	expect(screen.queryByTestId('misc-product-add-virtual')).toBeNull();
	expect((screen.getByTestId('misc-product-virtual-switch') as HTMLInputElement).checked).toBe(
		true
	);
	expect(await submitted()).toEqual(expect.objectContaining({ virtual: true }));
});

it("Virtual's Remove returns its add button and submits virtual: false", async () => {
	render(<AddMiscProduct />);
	fireEvent.click(screen.getByTestId('misc-product-add-virtual'));
	fireEvent.click(screen.getByTestId('misc-product-remove-virtual'));
	expect(screen.getByTestId('misc-product-add-virtual')).toBeTruthy();
	expect(screen.queryByTestId('misc-product-row-virtual')).toBeNull();
	expect(await submitted()).toEqual(expect.objectContaining({ virtual: false }));
});

it('an added SKU submits what was typed', async () => {
	render(<AddMiscProduct />);
	fireEvent.click(screen.getByTestId('misc-product-add-sku'));
	fireEvent.change(screen.getByTestId('misc-product-sku-input'), { target: { value: 'MISC-1' } });
	expect(await submitted()).toEqual(expect.objectContaining({ sku: 'MISC-1' }));
});
