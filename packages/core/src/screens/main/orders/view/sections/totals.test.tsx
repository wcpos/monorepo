/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { createTestT } from '../../../../../../jest/translate';
import { TotalsSection } from './totals';

const mockT = createTestT();
type Props = React.PropsWithChildren<{ testID?: string }>;
function mockDiv({ children, testID }: Props) {
	return <div data-testid={testID}>{children}</div>;
}
jest.mock('react-native', () => ({ View: mockDiv }));
jest.mock('@wcpos/components/text', () => ({ Text: mockDiv }));
jest.mock('./_section', () => ({
	Section: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => mockT }));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));

const rows = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('section > div > div')).map((row) => row.textContent);

it('prints each total as label then amount, the tax rates inset, closing on the net payment', () => {
	const { container } = render(
		<TotalsSection
			order={
				{
					line_items: [{ subtotal: '20' }, { total: '10' }],
					discount_total: '3',
					coupon_lines: [{ code: 'SAVE3' }],
					shipping_total: '5',
					shipping_lines: [{ method_title: 'Flat rate' }],
					fee_lines: [{ total: '1.5' }],
					total_tax: '2',
					tax_lines: [{ id: 1, label: 'VAT', rate_percent: 20, tax_total: '2' }],
					refunds: [{ id: 9, total: '-4.00' }],
					total: '35.50',
				} as never
			}
		/>
	);
	expect(rows(container)).toEqual([
		'Subtotal$30.00',
		'DiscountSAVE3$-3.00',
		'Shipping· Flat rate$5.00',
		'Fees$1.50',
		'Tax$2.00',
		'VAT 20%$2.00',
		'Refund$-4.00',
		'Net Payment$31.50',
	]);
});

it('closes on Total when nothing was refunded', () => {
	const { container } = render(<TotalsSection order={{ total: '12' } as never} />);
	expect(rows(container)).toEqual(['Subtotal$0.00', 'Total$12.00']);
});
