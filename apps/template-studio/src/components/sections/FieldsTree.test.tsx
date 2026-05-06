import React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

import { FieldsTree } from './FieldsTree';

const baseProps = {
	pristine: {},
	search: '',
	onChangePath: vi.fn(),
	onAddItem: vi.fn(),
	onRemoveItem: vi.fn(),
	onRevertSection: vi.fn(),
};

describe('FieldsTree', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('only hides configured system paths, not every field named id', () => {
		render(
			<FieldsTree
				{...baseProps}
				data={{
					id: 1,
					customer: { id: 42, name: 'Ada Lovelace' },
				}}
			/>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Customer' }));
		expect(screen.queryByLabelText('id')).not.toBeInTheDocument();
		expect(screen.getByLabelText('customer.id')).toHaveValue(42);
	});

	it('keeps nested tax ID values editable inside expanded arrays', () => {
		const onChangePath = vi.fn();
		render(
			<FieldsTree
				{...baseProps}
				onChangePath={onChangePath}
				data={{
					store: {
						name: 'Solstice Records',
						tax_ids: [
							{
								type: 'eu_vat',
								value: 'NL123456789B01',
								country: 'NL',
								label: 'VAT',
							},
						],
					},
				}}
			/>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Store' }));
		fireEvent.click(screen.getByRole('button', { name: 'Edit field store.tax_ids' }));

		const taxIdCard = screen.getByText('eu_vat: NL123456789B01').closest('.array-item');
		expect(taxIdCard).not.toBeNull();
		const scoped = within(taxIdCard as HTMLElement);
		expect(scoped.getByLabelText('store.tax_ids[0].type')).toHaveValue('eu_vat');
		expect(scoped.getByLabelText('store.tax_ids[0].value')).toHaveValue('NL123456789B01');
		expect(scoped.getByLabelText('store.tax_ids[0].country')).toHaveValue('NL');
		expect(scoped.getByLabelText('store.tax_ids[0].label')).toHaveValue('VAT');

		fireEvent.change(scoped.getByLabelText('store.tax_ids[0].value'), {
			target: { value: 'NL987654321B01' },
		});
		expect(onChangePath).toHaveBeenCalledWith(['store', 'tax_ids', 0, 'value'], 'NL987654321B01');
	});

	it('does not expose presentation hints in the editable field tree', () => {
		render(
			<FieldsTree
				{...baseProps}
				data={{
					presentation_hints: {
						display_tax: 'incl',
						prices_entered_with_tax: true,
						rounding_mode: 'per-line',
						locale: 'es_ES',
						order_barcode_type: 'code128',
					},
				}}
			/>
		);

		expect(screen.queryByRole('button', { name: 'Presentation' })).not.toBeInTheDocument();
		expect(screen.queryByLabelText('presentation_hints.display_tax')).not.toBeInTheDocument();
		expect(
			screen.queryByLabelText('presentation_hints.order_barcode_type')
		).not.toBeInTheDocument();
	});
});
