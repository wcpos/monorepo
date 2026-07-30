import { beforeEach, describe, expect, it } from 'vitest';

import { getActiveBarcodeSelectors, setActiveBarcodeSelectors } from '@wcpos/sync-core';

import {
	createConfigFingerprintLiveSource,
	mapConfigFingerprintEnvelope,
} from './config-fingerprint-source';

const envelope = (barcodeFields: Record<string, string[]>) => ({
	fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
	barcode_fields: barcodeFields,
});

describe('config fingerprint barcode selector boundaries', () => {
	beforeEach(() => {
		setActiveBarcodeSelectors('products', ['existing-product']);
		setActiveBarcodeSelectors('variations', ['existing-variation']);
	});

	it('keeps mapConfigFingerprintEnvelope pure', () => {
		mapConfigFingerprintEnvelope(
			envelope({
				products: ['sku'],
				variations: ['global_unique_id'],
				tax_rates: [],
			})
		);

		expect(getActiveBarcodeSelectors('products')).toEqual(['existing-product']);
		expect(getActiveBarcodeSelectors('variations')).toEqual(['existing-variation']);
	});

	it('applies non-empty selectors when polling the live source', async () => {
		const source = createConfigFingerprintLiveSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async () =>
				Response.json(
					envelope({
						products: ['global_unique_id'],
						variations: ['meta_data:_barcode'],
						tax_rates: [],
					})
				),
		});

		await source.pollConfigFingerprints();

		expect(getActiveBarcodeSelectors('products')).toEqual(['global_unique_id']);
		expect(getActiveBarcodeSelectors('variations')).toEqual(['meta_data:_barcode']);
	});

	it('does not replace existing selectors with empty lists', async () => {
		const source = createConfigFingerprintLiveSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async () => Response.json(envelope({ products: [], variations: [], tax_rates: [] })),
		});

		await source.pollConfigFingerprints();

		expect(getActiveBarcodeSelectors('products')).toEqual(['existing-product']);
		expect(getActiveBarcodeSelectors('variations')).toEqual(['existing-variation']);
	});
});
