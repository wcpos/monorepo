/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useBarcodeSearch } from './use-barcode-search';

type Payload = Record<string, unknown>;

interface FakeDoc {
	id: string;
	payload: Payload;
	getLatest: () => FakeDoc;
	collection: { name: string };
}

let productDocs: FakeDoc[] = [];
let variationDocs: FakeDoc[] = [];

function doc(id: string, payload: Payload, name: 'products' | 'variations' = 'products'): FakeDoc {
	const d: FakeDoc = { id, payload, collection: { name }, getLatest: () => d };
	return d;
}

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({
		engine: {
			active: () => ({
				database: {
					collections: {
						products: { find: () => ({ exec: async () => productDocs }) },
						variations: { find: () => ({ exec: async () => variationDocs }) },
					},
				},
			}),
		},
	}),
}));

// wrapEngineDocument is identity-ish for the test — we assert on ids.
jest.mock('@wcpos/query/engine-compat', () => ({
	wrapEngineDocument: (_name: string, document: FakeDoc) => document,
}));

function search(code: string) {
	const { result } = renderHook(() => useBarcodeSearch());
	return result.current.barcodeSearch(code);
}

beforeEach(() => {
	productDocs = [];
	variationDocs = [];
});

describe('barcodeSearch UPC-A ↔ EAN-13 equivalence (#740)', () => {
	it('prefers the exact match over an equivalent one (no false ambiguity)', async () => {
		productDocs = [
			doc('exact', { barcode: '012345678905' }),
			doc('equivalent', { barcode: '0012345678905' }),
		];
		const results = (await search('012345678905')) as unknown as FakeDoc[];
		expect(results.map((r) => r.id)).toEqual(['exact']);
	});

	it('falls back to the equivalent form when no product carries the exact code', async () => {
		productDocs = [doc('padded', { barcode: '0012345678905' })];
		const results = (await search('012345678905')) as unknown as FakeDoc[];
		expect(results.map((r) => r.id)).toEqual(['padded']);
	});

	it('matches a 13-digit camera scan against a 12-digit UPC-A barcode', async () => {
		productDocs = [doc('upc', { barcode: '012345678905' })];
		const results = (await search('0012345678905')) as unknown as FakeDoc[];
		expect(results.map((r) => r.id)).toEqual(['upc']);
	});

	it('does NOT equate a numeric SKU with a 0-prefixed barcode (SKU is not a barcode)', async () => {
		productDocs = [doc('sku-only', { sku: '012345678905' })];
		// A 13-digit scan must not resolve to the product whose SKU is the 12-digit form.
		const equiv = (await search('0012345678905')) as unknown as FakeDoc[];
		expect(equiv).toEqual([]);
		// The exact SKU still matches.
		const exact = (await search('012345678905')) as unknown as FakeDoc[];
		expect(exact.map((r) => r.id)).toEqual(['sku-only']);
	});

	it('does not let an exact SKU preempt a barcode-equivalence match (#740 P1)', async () => {
		productDocs = [
			doc('barcode-equiv', { barcode: '012345678905' }), // equivalent to the scan
			doc('sku-coincidence', { sku: '0012345678905' }), // coincidental exact SKU string
		];
		// Barcode semantics win: the genuine barcode-equivalence product is chosen, not
		// the unrelated product whose SKU happens to equal the scanned digits.
		const results = (await search('0012345678905')) as unknown as FakeDoc[];
		expect(results.map((r) => r.id)).toEqual(['barcode-equiv']);
	});
});
