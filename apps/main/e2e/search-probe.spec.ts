import { expect, test } from '@playwright/test';

import { plainPermalinkUrl, productProbeFailureAction } from './search-probe';

test('builds canonical rest_route URLs for plain WordPress permalinks', () => {
	expect(plainPermalinkUrl('https://example.test/shop/', 'products')).toBe(
		'https://example.test/shop/index.php?rest_route=/wc/v3/products'
	);
	expect(plainPermalinkUrl('https://example.test/shop/', 'customers', 42)).toBe(
		'https://example.test/shop/index.php?rest_route=/wc/v3/customers/42'
	);
});

test.describe('search-probe pure logic', () => {
	test('missing writer credentials keep product probes skippable', () => {
		expect(productProbeFailureAction({ writerConfigured: false, status: null })).toBe('skip');
		expect(productProbeFailureAction({ writerConfigured: false, status: 403 })).toBe('skip');
	});

	test('configured writer failures fail regardless of HTTP status', () => {
		expect(productProbeFailureAction({ writerConfigured: true, status: 403 })).toBe('fail');
		expect(productProbeFailureAction({ writerConfigured: true, status: 500 })).toBe('fail');
		expect(productProbeFailureAction({ writerConfigured: true, status: null })).toBe('fail');
	});
});
