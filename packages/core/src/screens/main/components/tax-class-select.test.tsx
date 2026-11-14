/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useTaxClassOptions } from './tax-class-select';

jest.mock('@wcpos/query', () => ({
	useDocField: () => [{ name: 'Standard', slug: 'standard' }],
}));

jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../contexts/extra-data', () => ({
	useExtraData: () => ({ extraData: {} }),
}));

describe('useTaxClassOptions', () => {
	it("offers the store's classes in the app's 'standard' spelling, and no parent by default", () => {
		const { result } = renderHook(() => useTaxClassOptions());
		expect(result.current).toEqual([{ label: 'Standard', value: 'standard' }]);
	});

	/**
	 * 'parent' is WooCommerce's variation sentinel, not a tax class, so the server's
	 * tax-class list never contains it — and a new variation defaults to it. A select
	 * without the option rendered that variation as the empty "Select Tax Class".
	 */
	it('offers "Same as parent" first when asked', () => {
		const { result } = renderHook(() => useTaxClassOptions(true));
		expect(result.current).toEqual([
			{ label: 'common.tax_class_same_as_parent', value: 'parent' },
			{ label: 'Standard', value: 'standard' },
		]);
	});
});
