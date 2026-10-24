/** @jest-environment jsdom */
import * as React from 'react';

import { render } from '@testing-library/react';

import { QuantityInput } from './quantity-input.web';

let mockFormat: (value: number) => string;
jest.mock('@wcpos/components/quantity-keypad', () => ({
	QuantityKeypad: ({ format }: { format: (value: number) => string }) => {
		mockFormat = format;
		return null;
	},
}));
jest.mock('../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
// A store that prices to two places: the quantity must not take the currency's scale.
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (store: Record<string, unknown>) => unknown) =>
		select({
			price_decimal_sep: '.',
			price_thousand_sep: ',',
			price_num_decimals: 2,
			thousands_group_style: 'thousand',
		}),
}));

it('shows a fractional quantity with its digits, and a whole one without decimals', () => {
	render(<QuantityInput value={1.125} onChangeText={jest.fn()} onRemove={jest.fn()} />);
	expect(mockFormat(1.125)).toBe('1.125');
	expect(mockFormat(0.001)).toBe('0.001');
	expect(mockFormat(12)).toBe('12');
	expect(mockFormat(123)).toBe('123');
});
