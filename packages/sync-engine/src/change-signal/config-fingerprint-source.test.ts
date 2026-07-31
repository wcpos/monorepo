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

describe('config fingerprint conditional requests', () => {
	it('parses the first response without a validator, then reuses its ETag on 304', async () => {
		const requests: ({ headers?: HeadersInit } | undefined)[] = [];
		let call = 0;
		const source = createConfigFingerprintLiveSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (_url, init) => {
				requests.push(init);
				call += 1;
				return call === 1
					? Response.json(envelope({ products: ['sku'], variations: [], tax_rates: [] }), {
							headers: { etag: '"config-1"' },
						})
					: new Response(null, { status: 304 });
			},
		});

		const first = await source.pollConfigFingerprints();
		setActiveBarcodeSelectors('products', ['changed-after-first-poll']);
		const cached = await source.pollConfigFingerprints();

		expect(first).toEqual({
			fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
			barcodeFields: { products: ['sku'], variations: [], tax_rates: [] },
		});
		expect(cached).toEqual(first);
		expect(getActiveBarcodeSelectors('products')).toEqual(['sku']);
		expect(new Headers(requests[0]?.headers).get('if-none-match')).toBeNull();
		expect(new Headers(requests[1]?.headers).get('if-none-match')).toBe('"config-1"');
	});

	it('keeps validator state scoped to each source instance', async () => {
		const requests: ({ headers?: HeadersInit } | undefined)[] = [];
		const fetcher = async (_url: string, init?: { headers?: HeadersInit }) => {
			requests.push(init);
			return Response.json(envelope({ products: ['sku'], variations: [], tax_rates: [] }), {
				headers: { etag: '"config-1"' },
			});
		};

		const firstSource = createConfigFingerprintLiveSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher,
		});
		await firstSource.pollConfigFingerprints();
		await firstSource.pollConfigFingerprints();
		const freshSource = createConfigFingerprintLiveSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher,
		});
		await freshSource.pollConfigFingerprints();

		expect(new Headers(requests[0]?.headers).get('if-none-match')).toBeNull();
		expect(new Headers(requests[1]?.headers).get('if-none-match')).toBe('"config-1"');
		expect(new Headers(requests[2]?.headers).get('if-none-match')).toBeNull();
	});
});
