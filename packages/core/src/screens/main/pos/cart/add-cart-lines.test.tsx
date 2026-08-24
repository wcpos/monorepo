/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AddFee } from './add-fee';
import { AddMiscProduct } from './add-misc-product';
import { AddShipping } from './add-shipping';

const mockAddFee = jest.fn(() => Promise.resolve());
const mockAddProduct = jest.fn(() => Promise.resolve());
const mockAddShipping = jest.fn(() => Promise.resolve());
const mockOnOpenChange = jest.fn();

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('@wcpos/components/dialog', () => ({
	DialogAction: ({
		children,
		disabled,
		onPress,
		testID,
	}: React.PropsWithChildren<{
		disabled?: boolean;
		onPress?: () => void;
		testID?: string;
	}>) => (
		<button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	DialogClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
	useRootContext: () => ({ onOpenChange: mockOnOpenChange }),
}));

jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => <>{children}</>,
	FormField: () => null,
	FormInput: () => null,
	FormRadioGroup: () => null,
	FormSelect: () => null,
	FormSwitch: () => null,
	FormTreeCombobox: () => null,
}));

jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// The store's shipping_tax_class, as read through mockUseDocField's observable path.
let mockShippingTaxClass = '';

jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => mockShippingTaxClass,
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: { shipping_tax_class$: {} } }),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../components/currency-input', () => ({ CurrencyInput: () => null }));
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../components/number-input', () => ({ NumberInput: () => null }));
jest.mock('../../components/product/category-select', () => ({ CategoryTreeLoader: () => null }));
jest.mock('../../components/shipping-method-select', () => ({ ShippingMethodSelect: () => null }));
jest.mock('../../components/tax-class-select', () => ({ TaxClassSelect: () => null }));
jest.mock('../../components/tax-status-radio-group', () => ({ TaxStatusRadioGroup: () => null }));
jest.mock('../hooks/use-add-fee', () => ({ useAddFee: () => ({ addFee: mockAddFee }) }));
jest.mock('../hooks/use-add-product', () => ({
	useAddProduct: () => ({ addProduct: mockAddProduct }),
}));
jest.mock('../hooks/use-add-shipping', () => ({
	useAddShipping: () => ({ addShipping: mockAddShipping }),
}));

function deferredWrite() {
	let resolve: () => void = () => undefined;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('cart line dialogs', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockShippingTaxClass = '';
	});

	it('prevents duplicate fee submissions while addFee is pending', async () => {
		const write = deferredWrite();
		mockAddFee.mockReturnValueOnce(write.promise);
		render(<AddFee />);

		const submit = screen.getByTestId('add-to-cart-submit');
		fireEvent.click(submit);
		await waitFor(() => expect(mockAddFee).toHaveBeenCalledTimes(1));
		expect(submit).toBeDisabled();

		fireEvent.click(submit);
		expect(mockAddFee).toHaveBeenCalledTimes(1);

		await act(async () => {
			write.resolve();
			await write.promise;
		});
		await waitFor(() => expect(mockOnOpenChange).toHaveBeenCalledWith(false));
	});

	it('prevents duplicate miscellaneous-product submissions while addProduct is pending', async () => {
		const write = deferredWrite();
		mockAddProduct.mockReturnValueOnce(write.promise);
		render(<AddMiscProduct />);

		const submit = screen.getByTestId('add-to-cart-submit');
		fireEvent.click(submit);
		await waitFor(() => expect(mockAddProduct).toHaveBeenCalledTimes(1));
		expect(submit).toBeDisabled();

		fireEvent.click(submit);
		expect(mockAddProduct).toHaveBeenCalledTimes(1);

		await act(async () => {
			write.resolve();
			await write.promise;
		});
		await waitFor(() => expect(mockOnOpenChange).toHaveBeenCalledWith(false));
	});

	it('prevents duplicate shipping submissions while addShipping is pending', async () => {
		const write = deferredWrite();
		mockAddShipping.mockReturnValueOnce(write.promise);
		render(<AddShipping />);

		const submit = screen.getByTestId('add-to-cart-submit');
		fireEvent.click(submit);
		await waitFor(() => expect(mockAddShipping).toHaveBeenCalledTimes(1));
		expect(submit).toBeDisabled();

		fireEvent.click(submit);
		expect(mockAddShipping).toHaveBeenCalledTimes(1);

		await act(async () => {
			write.resolve();
			await write.promise;
		});
		await waitFor(() => expect(mockOnOpenChange).toHaveBeenCalledWith(false));
	});

	/**
	 * The Add shipping dialog seeds its tax-class field from the store setting, and
	 * stamps that field into the line's pos_data — where it outranks the engine's own
	 * 'inherit' resolution. Seeded with a raw sentinel the select renders blank AND the
	 * rate filter matches nothing, so the shipping line is added with no tax at all.
	 * The seed is the store setting verbatim. 'inherit' is NOT collapsed to the standard
	 * class — it reaches the line's pos_data as the sentinel, and the engine resolves it
	 * against the cart's items (see cart-line.test.ts). Collapsing it here was the bug:
	 * a cart of reduced-rate items got standard-rate shipping tax.
	 */
	describe('seeds the shipping tax class from the store setting', () => {
		it.each([
			// store shipping_tax_class → tax_class submitted (wire spelling)
			['inherit', 'inherit'],
			['', ''],
			['reduced-rate', 'reduced-rate'],
		])('submits %p as %p', async (storeValue, expected) => {
			mockShippingTaxClass = storeValue;
			render(<AddShipping />);

			fireEvent.click(screen.getByTestId('add-to-cart-submit'));

			await waitFor(() => expect(mockAddShipping).toHaveBeenCalledTimes(1));
			expect(mockAddShipping).toHaveBeenCalledWith(
				expect.objectContaining({ tax_class: expected })
			);
		});
	});
});
