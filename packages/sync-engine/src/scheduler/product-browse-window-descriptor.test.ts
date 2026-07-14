// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	parseProductBrowseWindowLimit,
	PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT,
	productBrowseWindowQueryKey,
} from './product-browse-window-descriptor';

describe('product browse-window descriptor', () => {
	it('builds and parses a limit-N browse-window query key', () => {
		const queryKey = productBrowseWindowQueryKey(100);
		expect(queryKey).toBe('products:browse-window:limit=100');
		expect(parseProductBrowseWindowLimit(queryKey)).toBe(100);
	});

	it('defaults the window to the Woo per-page ceiling', () => {
		expect(PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT).toBe(100);
	});

	it('rejects non-browse-window keys, non-positive limits, and limits past the per-page ceiling', () => {
		expect(parseProductBrowseWindowLimit('products:search:keyboard')).toBeNull();
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=0')).toBeNull();
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=101')).toBeNull();
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=x')).toBeNull();
	});
});
