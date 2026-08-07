import { expect, test } from '@playwright/test';

import { plainPermalinkUrl } from './search-probe';

test('builds canonical rest_route URLs for plain WordPress permalinks', () => {
	expect(plainPermalinkUrl('https://example.test/shop/', 'products')).toBe(
		'https://example.test/shop/index.php?rest_route=/wc/v3/products'
	);
	expect(plainPermalinkUrl('https://example.test/shop/', 'customers', 42)).toBe(
		'https://example.test/shop/index.php?rest_route=/wc/v3/customers/42'
	);
});
