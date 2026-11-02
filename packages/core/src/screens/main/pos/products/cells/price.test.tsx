/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { Price } from './price';

const mockMoneyRow = jest.fn((_args: Record<string, unknown>) => null);

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../tiles/tile-words', () => ({
	moneyRow: (args: Record<string, unknown>) => mockMoneyRow(args),
}));

describe('Price cell', () => {
	it('reads the six price fields through one selector and hands them to moneyRow', () => {
		const Component = Price as unknown as React.ComponentType<{
			row: { original: { record: unknown } };
			column: { columnDef: { meta: { show: (key: string) => boolean } } };
		}>;
		const record = {
			payload: {
				price: '8.00',
				regular_price: '10.00',
				tax_status: 'taxable',
				tax_class: 'reduced-rate',
				on_sale: true,
				stock_status: 'outofstock',
			},
		};

		render(
			<Component
				row={{ original: { record } }}
				column={{ columnDef: { meta: { show: (key) => key === 'tax' } } }}
			/>
		);

		expect(mockMoneyRow).toHaveBeenCalledWith(
			expect.objectContaining({
				price: '8.00',
				regularPrice: '10.00',
				onSale: true,
				taxStatus: 'taxable',
				taxClass: 'reduced-rate',
				taxDisplay: 'text',
				out: true,
			})
		);
	});
});
