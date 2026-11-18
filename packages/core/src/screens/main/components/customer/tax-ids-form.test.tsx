/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { FormProvider, useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';

import { TaxIdsForm, useNewTaxIdRow } from './tax-ids-form';

import type { TaxIdType } from '../../../../lib/tax-id';

jest.mock('@wcpos/database', () =>
	jest.requireActual('@wcpos/database/collections/schemas/tax-id')
);

type FormValues = {
	billing: { country: string };
	tax_ids: { type: TaxIdType; value: string; country: string }[];
};
let mockStore = { store_country: '' };
let mockNextType: TaxIdType = 'eu_vat';

jest.mock('../../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('@wcpos/query', () => ({
	useDocField: (_store: unknown, selector: (value: typeof mockStore) => unknown) =>
		selector(mockStore),
}));
// A call with options shows them, so an interpolated message can be read back.
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, options?: object) =>
		options ? `${key} ${JSON.stringify(options)}` : key,
}));
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
		<div data-classes={className}>{children}</div>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
		<div data-classes={className}>{children}</div>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
		<div data-classes={className}>{children}</div>
	),
}));
jest.mock('@wcpos/components/form', () => {
	const { Controller } = jest.requireActual('react-hook-form') as typeof import('react-hook-form');
	return {
		FormField: Controller,
		FormInput: ({
			label,
			description,
			descriptionTone,
		}: {
			label: string;
			description?: string;
			descriptionTone?: string;
		}) => (
			<span
				data-testid={`input-${label}`}
				data-description={description}
				data-tone={descriptionTone}
			/>
		),
		FormSelect: ({
			customComponent: Component,
			value,
			onChange,
		}: {
			customComponent: React.ComponentType<{
				value: string;
				onChange: (value: string | undefined) => void;
				children?: React.ReactNode;
			}>;
			value: string;
			onChange: (value: string | undefined) => void;
		}) => <Component value={value} onChange={onChange} />,
	};
});
jest.mock('@wcpos/components/select', () => ({
	Select: ({
		value,
		onValueChange,
		children,
	}: React.PropsWithChildren<{
		value?: { label?: string };
		onValueChange: (option: { value: string; label: string }) => void;
	}>) => (
		<div>
			<span data-testid="selected-type">{value?.label}</span>
			<button
				data-testid="type-change"
				onClick={() => onValueChange({ value: mockNextType, label: mockNextType })}
			/>
			{children}
		</div>
	),
	SelectTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
	SelectValue: () => null,
	SelectContent: ({ children }: React.PropsWithChildren) => (
		<div data-testid="select-content">{children}</div>
	),
	SelectGroup: ({ children }: React.PropsWithChildren) => (
		<div data-testid="select-group">{children}</div>
	),
	SelectItem: ({ label }: { label: string }) => <div data-testid="select-item">{label}</div>,
	SelectSeparator: () => <hr data-testid="select-separator" />,
	OptionSelect: () => null,
}));

function renderForm(defaultValues: FormValues) {
	const formRef = React.createRef<UseFormReturn<FormValues>>();
	function Wrapper() {
		const form = useForm({ defaultValues });
		const newTaxIdRow = useNewTaxIdRow(form.control);
		const { append } = useFieldArray({ control: form.control, name: 'tax_ids' });
		React.useImperativeHandle(formRef, () => form);
		return (
			<FormProvider {...form}>
				<TaxIdsForm />
				<button data-testid="add-tax-id" onClick={() => append(newTaxIdRow())} />
			</FormProvider>
		);
	}
	render(<Wrapper />);
	return { rows: () => formRef.current!.getValues('tax_ids') };
}

describe('TaxIdsForm country defaults', () => {
	beforeEach(() => {
		mockStore = { store_country: 'DE' };
		mockNextType = 'eu_vat';
	});

	it('uses billing ES instead of the DE store when adding a row', () => {
		const form = renderForm({ billing: { country: 'ES' }, tax_ids: [] });
		fireEvent.click(screen.getByTestId('add-tax-id'));
		expect(form.rows()).toEqual([
			{ type: 'es_nif', value: '', country: 'ES', label: null, verified: null },
		]);
	});

	it.each([
		['DE', 'eu_vat'],
		['MX', 'other'],
		['', 'other'],
	])('uses store country %s when billing is blank', (country, type) => {
		mockStore.store_country = country;
		const form = renderForm({ billing: { country: '' }, tax_ids: [] });
		fireEvent.click(screen.getByTestId('add-tax-id'));
		expect(form.rows()).toEqual([{ type, value: '', country, label: null, verified: null }]);
	});

	it('suggests Italian types first while retaining an existing US EIN row and label', () => {
		const row = { type: 'us_ein' as const, value: '12-3456789', country: 'US' };
		const form = renderForm({ billing: { country: 'IT' }, tax_ids: [row] });
		expect(form.rows()).toEqual([row]);
		expect(screen.getByTestId('selected-type').textContent).toBe('tax_id.label.us_ein');
		const content = screen.getByTestId('select-content');
		expect(Array.from(content.children).map((child) => child.getAttribute('data-testid'))).toEqual([
			'select-group',
			'select-separator',
			'select-group',
		]);
		const [suggested, rest] = within(content).getAllByTestId('select-group');
		expect(
			within(suggested)
				.getAllByTestId('select-item')
				.map((item) => item.textContent)
		).toEqual(['tax_id.label.it_piva', 'tax_id.label.it_cf', 'tax_id.label.eu_vat']);
		const labels = within(content)
			.getAllByTestId('select-item')
			.map((item) => item.textContent);
		expect(labels.filter((label) => label === 'tax_id.label.us_ein')).toHaveLength(1);
		expect(
			within(rest)
				.getAllByTestId('select-item')
				.map((item) => item.textContent)
		).toContain('tax_id.label.us_ein');
	});

	it('uses resolved DE for EU VAT and the locked ES country for Spain NIF', () => {
		const form = renderForm({
			billing: { country: 'DE' },
			tax_ids: [{ type: 'us_ein', value: '12-3456789', country: 'US' }],
		});
		fireEvent.click(screen.getByTestId('type-change'));
		expect(form.rows()[0]).toMatchObject({ type: 'eu_vat', country: 'DE' });
		mockNextType = 'es_nif';
		fireEvent.click(screen.getByTestId('type-change'));
		expect(form.rows()[0]).toMatchObject({ type: 'es_nif', country: 'ES' });
	});
});

describe('a tax ID row', () => {
	beforeEach(() => {
		mockStore = { store_country: 'DE' };
	});
	const renderRow = (type: TaxIdType, value: string) =>
		renderForm({ billing: { country: 'DE' }, tax_ids: [{ type, value, country: 'DE' }] });
	const idInput = () => screen.getByTestId('input-tax_id.value_label');

	// The ID shrank to ~75 px beside Type and Country and cut the number off (decision 8A).
	it('Type and Country share a line and the ID has its own full line beneath them', () => {
		renderRow('eu_vat', 'DE123456789');
		const typeCell = screen.getByTestId('selected-type').closest('[data-classes]') as HTMLElement;
		const countryCell = screen.getByTestId('input-tax_id.country_label')
			.parentElement as HTMLElement;
		const row = typeCell.parentElement as HTMLElement;
		expect(countryCell.parentElement).toBe(row);
		expect(row.contains(idInput())).toBe(false);
		expect(row.compareDocumentPosition(idInput()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		const idClasses = (idInput().parentElement as HTMLElement).dataset.classes?.split(' ');
		expect(idClasses).toContain('p-2');
		expect(idClasses?.filter((name) => /^(min-)?w-|^flex-1$/.test(name))).toEqual([]);
	});

	it('a mismatch names the type and shows its example, in the warning tone', () => {
		renderRow('eu_vat', 'DE1234');
		expect(idInput().dataset.description).toBe(
			'tax_id.invalid_format_example {"type":"tax_id.label.eu_vat","example":"DE123456789"}'
		);
		expect(idInput().dataset.tone).toBe('warning');
	});

	// "Other" has no example, and only a blank value fails its check.
	it('an Other row keeps the plain message', () => {
		renderRow('other', ' ');
		expect(idInput().dataset.description).toBe('tax_id.invalid_format');
	});

	it('a valid ID shows no description', () => {
		renderRow('eu_vat', 'DE123456789');
		expect(idInput().dataset.description).toBeUndefined();
	});
});
