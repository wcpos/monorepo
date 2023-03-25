import { renderHook } from '@testing-library/react-hooks';
import { useObservableState } from 'observable-hooks';

import { useCurrencyFormat } from './use-currency-format';
import useLocalData from '../../../../contexts/local-data';

jest.mock('../../../../contexts/local-data', () =>
	require('../../../../contexts/local-data/__mocks__/local-data.mock')
);

/**
 * Mock the useObservableState hook
 */
jest.mock('observable-hooks');
(useObservableState as jest.Mock).mockImplementation((_, initialValue) => initialValue);

describe('useCurrencyFormat', () => {
	test('format number with symbol', () => {
		const { result } = renderHook(() => useCurrencyFormat({ withSymbol: true }));
		const formattedValue = result.current.format(1234.56);

		expect(formattedValue).toBe('$1,234.56');
	});

	test('format number without symbol', () => {
		const { result } = renderHook(() => useCurrencyFormat({ withSymbol: false }));
		const formattedValue = result.current.format(1234.56);

		expect(formattedValue).toBe('1,234.56');
	});

	test('unformat string value', () => {
		const { result } = renderHook(() => useCurrencyFormat());
		const unformattedValue = result.current.unformat('$1,234.56');

		expect(unformattedValue).toBe(1234.56);
	});

	test('format and unformat return original value', () => {
		const { result } = renderHook(() => useCurrencyFormat());
		const originalValue = '1234.56';
		const formattedValue = result.current.format(originalValue);
		const unformattedValue = result.current.unformat(formattedValue);

		expect(originalValue).toBe(unformattedValue);
	});

	test('BUG: ', () => {});
});
