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
					meta: { schema_version: 1, order_id: 1001 },
					customer: { id: 42, name: 'Ada Lovelace' },
				}}
			/>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Customer' }));
		expect(screen.getByLabelText('id')).toHaveValue(42);

		fireEvent.click(screen.getByRole('button', { name: 'Meta' }));
		expect(screen.queryByLabelText('schema_version')).not.toBeInTheDocument();
		expect(screen.getByLabelText('order_id')).toHaveValue(1001);
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
		fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		const taxIdCard = screen.getByText('eu_vat: NL123456789B01').closest('.array-item');
		expect(taxIdCard).not.toBeNull();
		const scoped = within(taxIdCard as HTMLElement);
		expect(scoped.getByLabelText('type')).toHaveValue('eu_vat');
		expect(scoped.getByLabelText('value')).toHaveValue('NL123456789B01');
		expect(scoped.getByLabelText('country')).toHaveValue('NL');
		expect(scoped.getByLabelText('label')).toHaveValue('VAT');

		fireEvent.change(scoped.getByLabelText('value'), {
			target: { value: 'NL987654321B01' },
		});
		expect(onChangePath).toHaveBeenCalledWith(['store', 'tax_ids', 0, 'value'], 'NL987654321B01');
	});
});
