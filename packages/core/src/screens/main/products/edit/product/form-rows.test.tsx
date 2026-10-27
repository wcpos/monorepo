/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { EditProductForm } from './form';

import type { UseFormReturn } from 'react-hook-form';

type Pressable = React.PropsWithChildren<{ onPress?: () => void; testID?: string }>;
type Field = {
	name?: string;
	value?: unknown;
	onChange: (value: unknown) => void;
	testID?: string;
	placeholder?: string;
};

const mockHarness: { form?: UseFormReturn<Record<string, unknown>> } = {};

jest.mock('@wcpos/components/form', () => {
	const { FormProvider, Controller } = jest.requireActual('react-hook-form');
	return {
		Form: FormProvider,
		FormField: Controller,
		FormItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
		FormInput: ({ name, value, onChange, testID, placeholder }: Field) => (
			<input
				data-testid={testID ?? name}
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
		FormSelect: () => null,
		FormTreeCombobox: () => null,
		SavedFieldProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
		SavedMark: () => null,
		useSavedName: () => '',
	};
});
jest.mock('@wcpos/components/property-row', () => ({
	PropertyList: ({ children }: React.PropsWithChildren) => <>{children}</>,
	PropertyRow: ({
		label,
		children,
		trailing,
		testID,
	}: React.PropsWithChildren<{ label: string; trailing?: React.ReactNode; testID?: string }>) => (
		<div data-testid={testID}>
			<span>{label}</span>
			{children}
			{trailing}
		</div>
	),
	PropertyVerb: ({ children, onPress, testID }: Pressable) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	PropertyAddRow: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	PropertyAdd: ({ label, onPress, testID }: Pressable & { label: string }) => (
		<button data-testid={testID} onClick={onPress}>
			{label}
		</button>
	),
	PropertyPlaceholder: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/collapsible', () => ({}));
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: () => null,
	useDialog: () => ({ close: jest.fn() }),
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
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: true } }),
}));
jest.mock('../../../components/currency-input', () => ({ CurrencyInput: () => null }));
jest.mock('../../../components/number-input', () => ({ NumberInput: () => null }));
jest.mock('../../../components/count-input', () => ({ CountInput: () => null }));
jest.mock('../../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../../components/product/status-select', () => ({ ProductStatusSelect: () => null }));
jest.mock('../../../components/product/category-select', () => ({
	CategoryTreeLoader: () => null,
}));
jest.mock('../../../components/tax-class-select', () => ({ useTaxClassOptions: () => [] }));
jest.mock('../../../components/tax-select', () => ({
	TaxSelect: ({ testID }: { testID: string }) => <div data-testid={testID} />,
}));
jest.mock('../use-catalogue-autosave', () => ({
	useCatalogueAutosave: ({ form }: { form: UseFormReturn<Record<string, unknown>> }) => {
		mockHarness.form = form;
		return { flush: async () => true };
	},
}));
jest.mock('../../product-actions', () => ({
	useProductActions: () => ({ canDelete: false, canSync: false }),
	DeleteProductDialog: () => null,
}));

function product(payload: Record<string, unknown> = {}) {
	const data = {
		id: 5,
		name: 'Hoodie',
		type: 'simple',
		categories: [],
		regular_price: '10',
		sale_price: '',
		status: 'publish',
		featured: false,
		virtual: false,
		downloadable: false,
		manage_stock: false,
		tax_status: 'taxable',
		tax_class: '',
		meta_data: [],
		...payload,
	};
	return {
		payload: data,
		toMutableJSON: () => ({ payload: data }),
		getLatest: () => ({ payload: data }),
	} as unknown as EngineRecord<'products'>;
}
const value = (name: string) => mockHarness.form!.getValues(name);
const row = (name: string) => screen.queryByTestId(`product-row-${name}`);

it('a simple product is its asked rows, stock untracked, and no Variations row', () => {
	render(<EditProductForm product={product()} />);
	for (const name of ['name', 'regular_price', 'sku', 'stock', 'tax', 'categories', 'status']) {
		expect(row(name)).toBeTruthy();
	}
	expect(screen.getByTestId('product-edit-name-input')).toBeTruthy();
	expect(row('stock')!.textContent).toContain('Not tracked');
	expect(row('stock')!.textContent).toContain('Track quantity');
	expect(row('variations')).toBeNull();
});

it('a variable product counts its variations, locked to the product list', () => {
	render(<EditProductForm product={product({ type: 'variable', variations: [1, 2, 3] })} />);
	expect(row('variations')!.textContent).toContain('3 variations');
	expect(row('variations')!.textContent).toContain('Managed in the product list');
	expect(row('variations')!.querySelector('button')).toBeNull();
});

it('Track quantity tracks stock and shows the quantity; Stop tracking turns it off', () => {
	render(<EditProductForm product={product()} />);
	expect(screen.queryByTestId('stock_quantity')).toBeNull();
	fireEvent.click(screen.getByText('Track quantity'));
	expect(value('manage_stock')).toBe(true);
	expect(screen.getByTestId('stock_quantity')).toBeTruthy();
	fireEvent.click(screen.getByText('Stop tracking'));
	expect(value('manage_stock')).toBe(false);
	expect(screen.queryByTestId('stock_quantity')).toBeNull();
});

it('offers Sale Price, Barcode, Featured, Virtual, Downloadable and Custom field', () => {
	render(<EditProductForm product={product()} />);
	const offered = screen.getAllByTestId(/^product-add-/).map((button) => button.textContent);
	expect(offered).toEqual([
		'Sale Price',
		'Barcode',
		'Featured',
		'Virtual',
		'Downloadable',
		'Custom field',
	]);
});

it('an added Featured arrives switched on, and Remove turns it off and offers it again', () => {
	render(<EditProductForm product={product()} />);
	fireEvent.click(screen.getByTestId('product-add-featured'));
	expect(value('featured')).toBe(true);
	expect((screen.getByTestId('product-featured') as HTMLInputElement).checked).toBe(true);
	fireEvent.click(screen.getByTestId('product-remove-featured'));
	expect(value('featured')).toBe(false);
	expect(row('featured')).toBeNull();
	expect(screen.getByTestId('product-add-featured')).toBeTruthy();
});

it('a fact with a value is a row, and Remove clears it through the form', () => {
	render(<EditProductForm product={product({ sale_price: '8' })} />);
	expect(screen.queryByTestId('product-add-sale_price')).toBeNull();
	fireEvent.click(screen.getByTestId('product-remove-sale_price'));
	expect(value('sale_price')).toBe('');
	expect(row('sale_price')).toBeNull();
});
