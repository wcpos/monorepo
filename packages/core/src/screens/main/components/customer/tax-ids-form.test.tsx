/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';

import { TaxIdsForm } from './tax-ids-form';

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
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, onPress }: React.PropsWithChildren<{ onPress: () => void }>) => (
		<button data-testid="add-tax-id" onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: ({ children }: React.PropsWithChildren) => <>{children}</>,
	CollapsibleContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	CollapsibleTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/form', () => {
	const { Controller } = jest.requireActual('react-hook-form') as typeof import('react-hook-form');
	return {
		FormField: Controller,
		FormInput: () => null,
		FormSelect: ({
			customComponent: Component,
			value,
			onChange,
		}: {
			customComponent: React.ComponentType<{
				value: { value: string; label: string };
				children?: React.ReactNode;
			}>;
			value: string;
			onChange: (value: TaxIdType) => void;
		}) => (
			<>
				<Component value={{ value, label: value }} />
				<button data-testid="type-change" onClick={() => onChange(mockNextType)} />
			</>
		),
	};
});
jest.mock('@wcpos/components/select', () => ({
	Select: ({ value, children }: React.PropsWithChildren<{ value?: { label?: string } }>) => (
		<div>
			<span data-testid="selected-type">{value?.label}</span>
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
		React.useImperativeHandle(formRef, () => form);
		return (
			<FormProvider {...form}>
				<TaxIdsForm />
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
