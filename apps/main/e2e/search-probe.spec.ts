import { expect, test } from '@playwright/test';

import {
	findCreatedProductRecord,
	plainPermalinkUrl,
	productProbeFailureAction,
	productWriterCredentialsDecision,
} from './search-probe';

test('builds canonical rest_route URLs for plain WordPress permalinks', () => {
	expect(plainPermalinkUrl('https://example.test/shop/', 'products')).toBe(
		'https://example.test/shop/index.php?rest_route=/wc/v3/products'
	);
	expect(plainPermalinkUrl('https://example.test/shop/', 'customers', 42)).toBe(
		'https://example.test/shop/index.php?rest_route=/wc/v3/customers/42'
	);
});

test.describe('search-probe pure logic', () => {
	test('writer credentials must be either fully configured or fully absent', () => {
		expect(productWriterCredentialsDecision(undefined, undefined)).toBe(false);
		expect(productWriterCredentialsDecision('writer', 'secret')).toBe(true);
		expect(() => productWriterCredentialsDecision('writer', undefined)).toThrow(
			'E2E_PRODUCT_WRITER_PASS'
		);
		expect(() => productWriterCredentialsDecision(undefined, 'secret')).toThrow(
			'E2E_PRODUCT_WRITER_USER'
		);
	});

	test('adopts only the exact product identified by the create token', () => {
		const exact = { id: 42, name: 'E2E Probe zxexact', slug: 'e2e-probe-zxexact' };
		expect(
			findCreatedProductRecord(
				[
					{ id: 41, name: 'Catalog zxexact lookalike' },
					exact,
					{ id: 43, name: 'E2E Probe zxexact-extra' },
				],
				'zxexact'
			)
		).toEqual(exact);
		expect(findCreatedProductRecord([], 'zxexact')).toBeNull();
	});

	test('missing writer credentials keep product probes skippable', () => {
		expect(
			productProbeFailureAction({
				writerConfigured: false,
				failure: 'http',
				retryAvailable: false,
			})
		).toBe('skip');
	});

	test('configured HTTP failures fail immediately, including variable-product creation', () => {
		expect(
			productProbeFailureAction({
				writerConfigured: true,
				failure: 'http',
				retryAvailable: true,
			})
		).toBe('fail');
	});

	test('transport failures retry once, then retain configured-writer failure policy', () => {
		expect(
			productProbeFailureAction({
				writerConfigured: true,
				failure: 'transport',
				retryAvailable: true,
			})
		).toBe('retry');
		expect(
			productProbeFailureAction({
				writerConfigured: true,
				failure: 'transport',
				retryAvailable: false,
			})
		).toBe('fail');
	});
});
