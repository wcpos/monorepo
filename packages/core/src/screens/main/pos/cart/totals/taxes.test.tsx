/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { MoneyList } from '@wcpos/components/money-list';

import { Taxes } from './taxes';

let mockDisplay = 'itemized';
jest.mock('@wcpos/query', () => ({
	useDocField: (_: unknown, select: (store: unknown) => unknown) =>
		select({ tax_total_display: mockDisplay }),
}));
jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});
jest.mock('@wcpos/components/hstack', () => {
	const { View } = jest.requireActual('react-native');
	return { HStack: View };
});
jest.mock('../../../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('../../../../../contexts/translations', () => {
	const strings = jest.requireActual('../../../../../contexts/translations/locales/en/core.json');
	return { useT: () => (key: string) => strings[key] ?? key };
});
jest.mock('../../../hooks/use-current-order-currency-format', () => ({
	useCurrentOrderCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../../hooks/use-tax-incl-or-excl', () => ({
	useTaxInclOrExcl: () => ({ inclOrExcl: 'excl' }),
}));

const taxLines = [
	{ label: 'VAT', tax_total: '1.00', shipping_tax_total: '0.50' },
	{ label: 'City', tax_total: '0.25', shipping_tax_total: '0' },
] as React.ComponentProps<typeof Taxes>['taxLines'];
const text = (props: React.ComponentProps<typeof Taxes>) =>
	render(
		<MoneyList>
			<Taxes {...props} />
		</MoneyList>
	).container.textContent;

it.each(['itemized', 'single'])(
	'an exempt order shows one Tax exempt row at zero (%s)',
	(display) => {
		mockDisplay = display;
		const shown = text({ totalTax: '0', taxLines: [], exempt: true });
		expect(shown).toBe('Tax exempt$0.00');
	}
);

it('without the exemption shows the rate rows', () => {
	mockDisplay = 'itemized';
	const shown = text({ totalTax: '1.75', taxLines, exempt: false });
	expect(shown).toContain('VAT');
	expect(shown).toContain('$1.50');
	expect(shown).toContain('City');
	expect(shown).not.toContain('Tax exempt');
});
