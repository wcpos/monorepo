/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { createTestT } from '../../../../../../jest/translate';
import { LineItemsSection } from './line-items';

const mockT = createTestT();

jest.mock('react-native', () => ({
	View: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/image', () => ({ Image: () => null }));
let mockPhone = false;
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockPhone }));
jest.mock('@wcpos/components/table', () => ({ TABLE_HEAD_TEXT: 'head' }));
// Mirrors the real Text, `decodeHtml` included — a mock that swallowed the prop
// would make the entity assertions below unfailable.
jest.mock('@wcpos/components/text', () => {
	const { decode } = jest.requireActual('html-entities');
	return {
		Text: ({ children, decodeHtml }: React.PropsWithChildren<{ decodeHtml?: boolean }>) => (
			<span>{decodeHtml && typeof children === 'string' ? decode(children) : children}</span>
		),
	};
});
jest.mock('./_section', () => ({
	Section: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => mockT }));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (n: number) => `$${n.toFixed(2)}` }),
}));

/**
 * A line item's name is the product title copied onto the order at sale time, so
 * it carries the same HTML entities the catalogue does. The cart decodes it (via
 * EditableField) and this view's own variation-meta line already decoded — only
 * the name, the parent name and the fee name were left raw, which put markup in
 * the most prominent text on the row.
 */
const order = {
	currency_symbol: '$',
	line_items: [
		{
			id: 1,
			name: 'Men&#039;s T-shirt &amp; Cap',
			parent_name: 'Ben &amp; Jerry&#039;s Merch',
			quantity: 1,
			subtotal: '10.00',
			total: '10.00',
			price: 10,
			meta_data: [{ id: 9, key: 'Size', display_key: 'Size', display_value: 'Large' }],
		},
	],
	fee_lines: [{ id: 2, name: 'Gift wrap &amp; card', total: '5.00' }],
} as unknown as Parameters<typeof LineItemsSection>[0]['order'];

describe('LineItemsSection', () => {
	it('reads product, parent and fee names as prose, not as HTML entities', () => {
		render(<LineItemsSection order={order} />);

		expect(screen.getByText("Men's T-shirt & Cap")).not.toBeNull();
		expect(screen.getByText("Ben & Jerry's Merch")).not.toBeNull();
		expect(screen.getByText('Gift wrap & card')).not.toBeNull();
		expect(screen.queryByText(/&#039;|&amp;/)).toBeNull();
	});

	it("reads in the cart's grammar: Qty · Item · Price · Total, qty first and total last", () => {
		const { container } = render(<LineItemsSection order={order} />);
		const text = container.textContent ?? '';

		expect(text.indexOf('Qty')).toBeLessThan(text.indexOf('Item'));
		expect(text.indexOf('Item')).toBeLessThan(text.indexOf('Price'));
		expect(text.indexOf('Price')).toBeLessThan(text.indexOf('Total'));
		// The row: 1, the product, its unit price, then its line total; no "1 × $10.00".
		expect(text).toContain("1Men's T-shirt & Cap");
		expect(text).toContain('Large$10.00$10.00');
		expect(text).not.toContain('×');
		// The fee row: no qty, no unit price, its total last.
		expect(text).toContain('Gift wrap & cardFees$5.00');
	});

	it('a phone drops the Price column as the cart does; the unit price joins the sub-line', () => {
		mockPhone = true;
		try {
			const { container } = render(<LineItemsSection order={order} />);
			const text = container.textContent ?? '';
			expect(text).not.toContain('Price');
			expect(text.indexOf('Item')).toBeLessThan(text.indexOf('Total'));
			// Sub-line carries the unit, then the line total ends the row.
			expect(text).toContain('Large$10.00$10.00');
			expect(text.match(/\$10\.00/g)).toHaveLength(2);
		} finally {
			mockPhone = false;
		}
	});
});
