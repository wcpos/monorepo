/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { of } from 'rxjs';

import { useClosureDocumentContext } from './use-closure-document-context';

const session = {
	store: {
		id: 1,
		currency: 'USD',
		currency_pos: 'left',
		timezone: 'UTC',
		price_num_decimals: 2,
		price_decimal_sep: '.',
		price_thousand_sep: ',',
	},
	site: {},
	wpCredentials: {
		populate$: () =>
			of([
				{
					id: 2,
					name: 'Tokyo',
					currency: 'JPY',
					currency_pos: 'right',
					timezone: 'Asia/Tokyo',
					locale: 'de_DE',
					price_num_decimals: 0,
					price_decimal_sep: '.',
					price_thousand_sep: ',',
				},
			]),
	},
};
jest.mock('../../contexts/app-state', () => ({ useAppState: () => session }));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(row: T, select: (value: T) => unknown) => (row ? select(row) : undefined),
}));
jest.mock('../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../hooks/use-locale', () => ({
	...jest.requireActual('../../hooks/use-locale'),
	useLocale: () => ({ code: 'en-US' }),
}));

// Revert: build the closure detail's currency/timezone context from the bound store.
it('uses the viewed store currency, precision and timezone without rebinding the till', () => {
	const { result } = renderHook(() => useClosureDocumentContext(2));
	expect(result.current.store.name).toBe('Tokyo');
	expect(result.current.timezone).toBe('Asia/Tokyo');
	expect(result.current.formatMoney('1200.0000')).toBe('1,200¥');
	expect(session.store.id).toBe(1);
});

// Revert: format a viewed store's document in the bound store's language.
it('formats the viewed store document in that store language', () => {
	const { result } = renderHook(() => useClosureDocumentContext(2));
	expect(result.current.locale).toBe('de');
	expect(renderHook(() => useClosureDocumentContext(1)).result.current.locale).toBe('en-US');
});

// Revert: drop the documented store-zero fallback when the credential list has no zero entry.
it.each([0, 5])('uses the bound store for store zero without a list match (bound: %s)', (id) => {
	const previous = session.store.id;
	session.store.id = id;
	try {
		const { result } = renderHook(() => useClosureDocumentContext(0));
		expect(result.current.currency).toBe('USD');
		expect(result.current.timezone).toBe('UTC');
		expect(result.current.formatMoney('12')).toBe('$12.00');
	} finally {
		session.store.id = previous;
	}
});
