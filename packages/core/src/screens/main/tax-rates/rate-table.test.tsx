/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen, within } from '@testing-library/react';

import { DeviceScope } from '@wcpos/components/lib/device';

import { TaxRateTable } from './rate-table';

import type { TaxRateData } from '../contexts/tax-rates';

// The table primitives as plain boxes (the real ones pull in the pulse row's native motion);
// each head is marked so the column order can be read back.
jest.mock('@wcpos/components/table', () => {
	const box = (role?: string) => {
		function Box({ children, testID }: { children?: React.ReactNode; testID?: string }) {
			return <div data-testid={testID ?? role}>{children}</div>;
		}
		return Box;
	};
	return {
		TABLE_HEAD_TEXT: 'head',
		Table: box(),
		TableBody: box(),
		TableCell: box(),
		TableHead: box('table-head'),
		TableHeader: box(),
		TableRow: box(),
	};
});
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../hooks/use-percent-format', () => ({
	usePercentFormat: () => (value: number | string) => `${Number(value)}%`,
}));

const rate = (fields: Partial<TaxRateData>) =>
	({
		id: 1,
		name: 'VAT',
		rate: '20.0000',
		class: 'standard',
		country: 'GB',
		state: '',
		postcodes: [],
		cities: [],
		priority: 1,
		compound: false,
		shipping: true,
		order: 0,
		...fields,
	}) as TaxRateData;

const rates = [
	rate({}),
	rate({
		id: 2,
		name: 'US AL',
		rate: '2.0000',
		country: 'US',
		state: 'AL',
		postcodes: ['12345', '123456'],
		compound: true,
		shipping: false,
		priority: 2,
	}),
];

const renderTable = (phone: boolean, shown: TaxRateData[] = rates) =>
	render(
		<DeviceScope phone={phone}>
			<TaxRateTable rates={shown} />
		</DeviceScope>
	);

describe('off a phone', () => {
	it("draws WooCommerce's seven columns in its order", () => {
		renderTable(false);
		expect(screen.getAllByTestId('table-head').map((head) => head.textContent)).toEqual([
			'tax_rates.country_code',
			'tax_rates.state_code',
			'common.postcode',
			'common.city',
			'tax_rates.rate',
			'tax_rates.tax_name',
			'tax_rates.priority',
		]);
		expect(screen.queryByTestId('tax-rates-list')).toBeNull();
	});

	it('reads wildcards as Any, rates as percentages, and tags only when they say something', () => {
		renderTable(false);
		const table = within(screen.getByTestId('tax-rates-table'));
		// GB: state, postcode and city are wildcards; US AL: only the city is.
		expect(table.getAllByText('tax_rates.any')).toHaveLength(4);
		expect(table.getByText('12345, 123456')).toBeTruthy();
		expect(table.getByText('20%')).toBeTruthy();
		expect(table.getByText('tax_rates.compound · tax_rates.not_on_shipping')).toBeTruthy();
		// The defaults say nothing: one tags line for two rows.
		expect(table.queryAllByText(/tax_rates\.compound|tax_rates\.not_on_shipping/)).toHaveLength(1);
	});
});

it('on a phone renders the list rows and no table', () => {
	renderTable(true);
	expect(screen.getByTestId('tax-rate-row-1')).toBeTruthy();
	expect(screen.getByTestId('tax-rate-row-2')).toBeTruthy();
	expect(screen.queryByTestId('tax-rates-table')).toBeNull();
	expect(screen.getByText('GB · tax_rates.any_location')).toBeTruthy();
	expect(screen.getByText('US · AL · 12345, 123456')).toBeTruthy();
});

it.each([false, true])('an empty class says so, with no table or rows (phone: %s)', (phone) => {
	renderTable(phone, []);
	expect(screen.getByText('tax_rates.none_in_class')).toBeTruthy();
	expect(screen.queryByTestId('tax-rates-table')).toBeNull();
	expect(screen.queryByTestId('table-head')).toBeNull();
	expect(screen.queryByTestId('tax-rates-list')).toBeNull();
});
