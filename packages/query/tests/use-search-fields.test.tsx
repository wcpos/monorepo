import { act, renderHook } from '@testing-library/react';

import { SEARCH_FIELDS, setSearchMetaKeys } from '../src/search-fields';
import { useSearchFields } from '../src/use-search-fields';

/**
 * Codex review on #2423: a binding that renders before the site's meta keys land (a direct
 * launch into Customers, or the launch-time site refresh) must pick them up at once, not on
 * its next incidental render — so the field list is a subscription, not a plain read.
 */
describe('useSearchFields', () => {
	afterEach(() => setSearchMetaKeys(undefined));

	it('re-renders a mounted consumer when the site keys change, with a stable identity in between', () => {
		const { result, rerender } = renderHook(() => useSearchFields('customers'));
		const base = result.current;
		expect(base).toEqual(SEARCH_FIELDS.customers);
		rerender();
		expect(result.current).toBe(base);

		act(() => setSearchMetaKeys({ customers: ['loyalty_number'] }));
		expect(result.current).toEqual([...SEARCH_FIELDS.customers, 'meta_data:loyalty_number']);
		expect(result.current).not.toBe(base);

		act(() => setSearchMetaKeys(undefined));
		expect(result.current).toEqual(SEARCH_FIELDS.customers);
	});

	it('is undefined for a collection with no search fields', () => {
		const { result } = renderHook(() => useSearchFields('refunds'));
		expect(result.current).toBeUndefined();
	});
});
