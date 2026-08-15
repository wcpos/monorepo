import { beforeEach, describe, expect, it } from 'vitest';

import {
	createScopeBarcodeSelectors,
	type ScopeBarcodeSelectors,
} from '../materialization/barcode-selectors';
import {
	createConfigFingerprintLiveSource,
	mapConfigFingerprintEnvelope,
} from './config-fingerprint-source';

const envelope = (barcodeFields: Record<string, string[]>) => ({
	fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
	barcode_fields: barcodeFields,
});

describe('config fingerprint barcode selector boundaries', () => {
	let scope: ScopeBarcodeSelectors;

	beforeEach(() => {
		scope = createScopeBarcodeSelectors();
		scope.publish('products', ['existing-product']);
		scope.publish('variations', ['existing-variation']);
	});

	const sourceFor = (fields: Record<string, string[]>) =>
		createConfigFingerprintLiveSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async () => Response.json(envelope(fields)),
			publishBarcodeSelectors: (collection, selectors) => scope.publish(collection, selectors),
		});

	it('keeps mapConfigFingerprintEnvelope pure', () => {
		mapConfigFingerprintEnvelope(
			envelope({
				products: ['sku'],
				variations: ['global_unique_id'],
				tax_rates: [],
			})
		);

		expect(scope.current()).toEqual({
			products: ['existing-product'],
			variations: ['existing-variation'],
		});
	});

	it('publishes non-empty selectors onto the polled scope', async () => {
		await sourceFor({
			products: ['global_unique_id'],
			variations: ['meta_data:_barcode'],
			tax_rates: [],
		}).pollConfigFingerprints();

		expect(scope.current()).toEqual({
			products: ['global_unique_id'],
			variations: ['meta_data:_barcode'],
		});
	});

	it('does not replace existing selectors with empty lists', async () => {
		await sourceFor({ products: [], variations: [], tax_rates: [] }).pollConfigFingerprints();

		expect(scope.current()).toEqual({
			products: ['existing-product'],
			variations: ['existing-variation'],
		});
	});

	it('leaves OTHER scopes untouched — carriers are per scope, not per process', async () => {
		const other = createScopeBarcodeSelectors();

		await sourceFor({
			products: ['global_unique_id'],
			variations: ['meta_data:_barcode'],
			tax_rates: [],
		}).pollConfigFingerprints();

		expect(other.current()).toEqual({ products: [], variations: [] });
	});
});

describe('config fingerprint conditional requests', () => {
	it('parses the first response without a validator, then reuses its ETag on 304', async () => {
		const requests: ({ headers?: HeadersInit } | undefined)[] = [];
		const scope = createScopeBarcodeSelectors();
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
			publishBarcodeSelectors: (collection, selectors) => scope.publish(collection, selectors),
		});

		const first = await source.pollConfigFingerprints();
		scope.publish('products', ['changed-after-first-poll']);
		const cached = await source.pollConfigFingerprints();

		expect(first).toEqual({
			fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
			barcodeFields: { products: ['sku'], variations: [], tax_rates: [] },
		});
		expect(cached).toEqual(first);
		// The 304 re-publishes the cached snapshot's carriers onto the scope.
		expect(scope.current().products).toEqual(['sku']);
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
