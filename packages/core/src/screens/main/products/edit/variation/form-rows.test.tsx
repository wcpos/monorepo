/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { EditVariationForm } from './form';

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
jest.mock('../../../components/tax-class-select', () => ({
	useTaxClassOptions: () => [{ label: 'Standard rate', value: 'standard' }],
}));
type TaxChange = (value: { tax_status: string; tax_class: string }) => void;
// Pressing the select picks Same as parent.
jest.mock('../../../components/tax-select', () => ({
	TaxSelect: ({
		testID,
		taxClass,
		onChange,
	}: {
		testID: string;
		taxClass: string;
		onChange: TaxChange;
	}) => (
		<>
			<span data-testid={`${testID}-value`}>{taxClass}</span>
			<button
				data-testid={testID}
				onClick={() => onChange({ tax_status: 'taxable', tax_class: 'parent' })}
			/>
			{/* Not taxable echoes the select's own class prop, as the real select does. */}
			<button
				data-testid={`${testID}-none`}
				onClick={() => onChange({ tax_status: 'none', tax_class: taxClass })}
			/>
		</>
	),
}));
jest.mock('../use-catalogue-autosave', () => ({
	useCatalogueAutosave: ({ form }: { form: UseFormReturn<Record<string, unknown>> }) => {
		mockHarness.form = form;
		return { flush: async () => true };
	},
}));
jest.mock('../../product-actions', () => ({
	useVariationActions: () => ({ canDelete: false, canSync: false }),
	DeleteVariationDialog: () => null,
}));

function variation(payload: Record<string, unknown> = {}) {
	const data = {
		id: 7,
		parent_id: 5,
		regular_price: '10',
		sale_price: '',
		status: 'publish',
		manage_stock: false,
		tax_status: 'taxable',
		tax_class: 'parent',
		meta_data: [],
		...payload,
	};
	return {
		payload: data,
		toMutableJSON: () => ({ payload: data }),
		getLatest: () => ({ payload: data }),
	} as unknown as EngineRecord<'variations'>;
}
const value = (name: string) => mockHarness.form!.getValues(name);
const tax = () => screen.getByTestId('variation-row-tax');

it("a variation that follows its parent reads Same as parent and the parent's class", () => {
	render(<EditVariationForm variation={variation()} parentClass="standard" />);
	expect(tax().textContent).toContain('Same as parent · Standard rate');
	expect(screen.queryByTestId('variation-tax-select')).toBeNull();
	fireEvent.click(screen.getByText('Set for this variation'));
	expect(screen.getByTestId('variation-tax-select')).toBeTruthy();
	expect(screen.queryByText('Set for this variation')).toBeNull();
	expect(value('tax_class')).toBe('parent');
	// The select opens on the STORED value, so picking the parent's own class is a change.
	expect(screen.getByTestId('variation-tax-select-value').textContent).toBe('parent');
});

it('Not taxable while the override select shows the parent class keeps the parent sentinel', () => {
	render(<EditVariationForm variation={variation()} parentClass="standard" />);
	fireEvent.click(screen.getByText('Set for this variation'));
	fireEvent.click(screen.getByTestId('variation-tax-select-none'));
	expect(value('tax_status')).toBe('none');
	expect(value('tax_class')).toBe('parent');
});

it('with no parent on the device the derived value is Same as parent alone', () => {
	render(<EditVariationForm variation={variation()} />);
	expect(tax().textContent).toContain('Same as parent');
	expect(tax().textContent).not.toContain('·');
});

it('a variation with its own class is the Tax select; choosing Same as parent derives it', () => {
	render(<EditVariationForm variation={variation({ tax_class: 'reduced-rate' })} />);
	expect(screen.queryByText('Set for this variation')).toBeNull();
	fireEvent.click(screen.getByTestId('variation-tax-select'));
	expect(value('tax_class')).toBe('parent');
	expect(screen.queryByTestId('variation-tax-select')).toBeNull();
	expect(screen.getByText('Set for this variation')).toBeTruthy();
});

it('asks Regular price, Stock, Tax and Status; offers Sale Price, SKU, Barcode, Custom field', () => {
	render(<EditVariationForm variation={variation()} />);
	for (const name of ['regular_price', 'stock', 'tax', 'status']) {
		expect(screen.getByTestId(`variation-row-${name}`)).toBeTruthy();
	}
	const offered = screen.getAllByTestId(/^variation-add-/).map((button) => button.textContent);
	expect(offered).toEqual(['Sale Price', 'SKU', 'Barcode', 'Custom field']);
	fireEvent.click(screen.getByTestId('variation-add-sku'));
	expect(screen.getByTestId('variation-row-sku')).toBeTruthy();
	expect(screen.getByTestId('variation-remove-sku')).toBeTruthy();
});
