/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { EditFeeLineForm } from './edit-fee-line/form';
import { EditLineItemForm } from './edit-line-item/form';
import { EditShippingLineForm } from './edit-shipping-line/form';

function mockWrap({ children }: React.PropsWithChildren) {
	return <>{children}</>;
}
function mockField({ testID }: { testID?: string }) {
	return <span data-testid={testID} />;
}
jest.mock('@wcpos/components/form', () => {
	const { FormProvider, Controller } = jest.requireActual('react-hook-form');
	return {
		Form: FormProvider,
		FormField: Controller,
		useFormChangeHandler: jest.requireActual('@wcpos/components/form/use-form-change-handler')
			.useFormChangeHandler,
		SavedFieldProvider: mockWrap,
		SavedMark: () => null,
		useMarkSaved: () => jest.fn(),
		useSavedName: () => '',
		FormItem: ({ children, nativeID }: React.PropsWithChildren<{ nativeID?: string }>) => (
			<div data-form-item={nativeID ?? ''}>{children}</div>
		),
		FormLabel: ({
			children,
			accessibilityLabel,
		}: React.PropsWithChildren<{ accessibilityLabel?: string }>) => (
			<label aria-label={accessibilityLabel}>{children}</label>
		),
		FormInput: ({
			value,
			onChange,
			testID,
		}: {
			value?: unknown;
			onChange: (value: string) => void;
			testID?: string;
		}) => (
			<input
				data-testid={testID}
				value={String(value ?? '')}
				onChange={(e) => onChange(e.target.value)}
			/>
		),
		FormSwitch: ({
			value,
			onChange,
			testID,
		}: {
			value?: boolean;
			onChange: (value: boolean) => void;
			testID?: string;
		}) => (
			<input
				type="checkbox"
				data-testid={testID}
				checked={!!value}
				onChange={(e) => onChange(e.target.checked)}
			/>
		),
		FormSelect: () => null,
		FormRadioGroup: () => null,
		FormTreeCombobox: () => null,
	};
});
// The real rows; their Button loads the icon set's styling.
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; testID?: string }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: mockWrap,
}));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: mockWrap,
	TooltipContent: mockWrap,
	TooltipTrigger: mockWrap,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: mockWrap,
	DialogFooter: jest.requireActual('../../../../../../jest/footer.test-utils').DialogFooter,
	DialogClose: mockWrap,
	DialogAction: mockWrap,
	useDialog: () => ({ close: jest.fn() }),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../components/tax-select', () => ({ TaxSelect: mockField }));
jest.mock('../../../components/amount-unit-toggle', () => ({ AmountUnitToggle: mockField }));
jest.mock('../../../components/shipping-method-select', () => ({
	ShippingMethodSelect: () => null,
}));
jest.mock('../../../components/tax-radio-groups', () => ({
	TaxStatusRadioGroup: () => null,
}));
jest.mock('../../../components/product/category-select', () => ({
	CategoryTreeLoader: () => null,
}));
// A form's amount stands in as the form's own input mock: the rows are under test, not the field.
jest.mock('../../../components/amount-field', () => ({
	AmountField: () => null,
	FormAmountField: (props: object) => {
		const { FormInput } = jest.requireMock('@wcpos/components/form');
		return <FormInput {...props} />;
	},
}));
jest.mock('../../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../../hooks/use-number-format', () => ({ QUANTITY_FORMAT: {} }));
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-1' } }),
}));
jest.mock('../../hooks/use-update-cart-line', () => ({
	useUpdateCartLine: () => ({ updateCartLine: jest.fn().mockResolvedValue(true) }),
}));
jest.mock('../../hooks/use-line-item-data', () => ({
	useLineItemData: () => ({
		getLineItemData: (item: { price: string; regular_price: string }) => ({
			price: item.price,
			regular_price: item.regular_price,
			tax_status: 'taxable',
		}),
	}),
}));
jest.mock('../../hooks/use-fee-line-data', () => ({
	useFeeLineData: () => ({
		getFeeLineData: () => ({ amount: '10', percent: false, prices_include_tax: false }),
	}),
}));
jest.mock('../../hooks/use-shipping-line-data', () => ({
	useShippingLineData: () => ({
		getShippingLineData: () => ({ amount: '5', tax_status: 'taxable', prices_include_tax: false }),
	}),
}));

type LineItem = React.ComponentProps<typeof EditLineItemForm>['item'];
const line = (fields: Partial<LineItem> & { regular_price?: string }) =>
	({ product_id: 12, name: 'Hoodie', quantity: 2, price: 69, meta_data: [], ...fields }) as never;
const has = (testID: string) => screen.queryByTestId(testID) !== null;

it('a catalogue line on sale is Name, Quantity, Price was Regular, Tax; it offers SKU', () => {
	render(<EditLineItemForm uuid="l1" item={line({ price: 69, regular_price: '79' })} />);
	for (const row of ['name', 'quantity', 'price', 'tax'])
		expect(has(`line-item-row-${row}`)).toBe(true);
	expect(screen.getByText('was')).toBeTruthy();
	expect((screen.getByTestId('edit-line-item-regular_price-input') as HTMLInputElement).value).toBe(
		'79'
	);
	// Its own form item, named "Regular Price" for a screen reader, never a second "Price" (Codex, #2980).
	const regular = screen
		.getByTestId('edit-line-item-regular_price-input')
		.closest('[data-form-item]');
	expect(regular?.getAttribute('data-form-item')).toBe('line-item-regular_price');
	expect(regular?.querySelector('label')?.getAttribute('aria-label')).toBe('Regular Price');
	for (const row of ['categories', 'virtual', 'downloadable'])
		expect(has(`line-item-row-${row}`)).toBe(false);
	const offered = screen
		.getAllByTestId(/-add-/)
		.map((button) => button.getAttribute('data-testid'));
	expect(offered).toEqual(['edit-line-item-add-sku', 'line-item-add-meta_data']);
});

it('a line not on sale shows one price and offers Regular price, prefilled from the price', () => {
	render(<EditLineItemForm uuid="l1" item={line({ price: 79, regular_price: '79' })} />);
	expect(screen.queryByText('was')).toBeNull();
	expect(has('edit-line-item-regular_price-input')).toBe(false);
	fireEvent.click(screen.getByTestId('edit-line-item-add-regular_price'));
	expect(screen.getByText('was')).toBeTruthy();
	expect((screen.getByTestId('edit-line-item-regular_price-input') as HTMLInputElement).value).toBe(
		'79'
	);
});

it('a misc line offers Categories, Virtual and Downloadable; Virtual arrives switched on', () => {
	render(<EditLineItemForm uuid="l1" item={line({ product_id: 0, regular_price: '69' })} />);
	for (const name of ['categories', 'virtual', 'downloadable'])
		expect(has(`edit-line-item-add-${name}`)).toBe(true);
	fireEvent.click(screen.getByTestId('edit-line-item-add-virtual'));
	expect(has('line-item-row-virtual')).toBe(true);
	expect((screen.getByTestId('edit-line-item-virtual-switch') as HTMLInputElement).checked).toBe(
		true
	);
});

it("a variation's attribute is locked and the line's developer meta stays in the JSON tab", () => {
	const meta_data = [
		{
			id: 1,
			key: 'pa_color',
			value: 'blue',
			attr_id: 3,
			display_key: 'Color',
			display_value: 'Blue',
		},
		{ id: 2, key: '_woocommerce_pos_data', value: '{}' },
		{ id: 3, key: 'gift', value: 'yes' },
	];
	render(<EditLineItemForm uuid="l1" item={line({ regular_price: '69', meta_data })} />);
	expect(screen.getByText('Color')).toBeTruthy();
	expect(screen.getByText('Blue')).toBeTruthy();
	expect(has('line-item-row-meta-0')).toBe(true);
	expect(has('line-item-remove-meta-0')).toBe(false);
	expect(has('line-item-row-meta-1')).toBe(false);
	expect(has('line-item-remove-meta-2')).toBe(true);
});

it('the fee line is Fee name, Amount with its unit, Amount includes tax, Tax; it offers Custom field', () => {
	render(<EditFeeLineForm uuid="f1" item={{ name: 'Fee', meta_data: [] } as never} />);
	for (const row of ['name', 'amount', 'includes-tax', 'tax'])
		expect(has(`fee-line-row-${row}`)).toBe(true);
	expect(has('fee-line-percent-switch')).toBe(true);
	expect(has('edit-fee-line-includes-tax-switch')).toBe(true);
	expect(has('fee-line-add-meta_data')).toBe(true);
});

it('the shipping line is Title, Method, Amount, Amount includes tax, Tax; Instance ID is gone', () => {
	render(
		<EditShippingLineForm
			uuid="s1"
			item={
				{ method_title: 'Post', method_id: 'flat_rate', instance_id: '4', meta_data: [] } as never
			}
		/>
	);
	for (const row of ['method_title', 'method_id', 'amount', 'includes-tax', 'tax'])
		expect(has(`shipping-line-row-${row}`)).toBe(true);
	expect(has('edit-shipping-line-instance_id-input')).toBe(false);
	expect(has('shipping-line-percent-switch')).toBe(false);
	expect(has('shipping-line-add-meta_data')).toBe(true);
});
