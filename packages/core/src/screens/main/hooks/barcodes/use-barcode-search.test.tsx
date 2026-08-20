/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { deriveBarcodeFromPayload } from '@wcpos/sync-core';

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
/** The ACTIVE SCOPE's barcode carriers — the hook reads them off the scope. */
let scopeSelectors: { products: readonly string[]; variations: readonly string[] } = {
	products: [],
	variations: [],
};

function setSelectors(collection: 'products' | 'variations', list: readonly string[]): void {
	scopeSelectors = { ...scopeSelectors, [collection]: list };
}

function doc(id: string, payload: Payload, name: 'products' | 'variations' = 'products'): FakeDoc {
	const d: FakeDoc = {
		id,
		payload: { status: 'publish', ...payload },
		collection: { name },
		getLatest: () => d,
	};
	return d;
}

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({
		engine: {
			active: () => ({
				barcodeSelectors: scopeSelectors,
				database: {
					collections: {
						products: { find: () => ({ exec: async () => productDocs }) },
						variations: { find: () => ({ exec: async () => variationDocs }) },
					},
				},
			}),
		},
	}),
	engineCollection: (database: { collections?: Record<string, unknown> } | null, name: string) =>
		database?.collections?.[name] ?? null,
	isEngineRxDocument: () => true,
	// wrapEngineDocument is identity-ish for the test — we assert on ids.
	wrapEngineDocument: (_name: string, document: FakeDoc) => document,
}));

function search(code: string) {
	const { result } = renderHook(() => useBarcodeSearch());
	return result.current.barcodeSearch(code);
}

beforeEach(() => {
	productDocs = [];
	variationDocs = [];
	setSelectors('products', ['barcode']);
	setSelectors('variations', ['barcode']);
});

describe('barcodeSearch product visibility', () => {
	it.each([
		['sku', { sku: 'LOCAL-1' }],
		['global_unique_id', { global_unique_id: 'LOCAL-1' }],
		['meta_data:_barcode', { meta_data: [{ key: '_barcode', value: 'LOCAL-1' }] }],
	] as const)('resolves the materialized %s carrier fully offline', async (selector, raw) => {
		setSelectors('products', [selector]);
		productDocs = [
			doc('local', {
				...raw,
				barcode: deriveBarcodeFromPayload(raw, [selector]),
			}),
		];

		expect((await search('LOCAL-1')) as unknown as FakeDoc[]).toMatchObject([{ id: 'local' }]);
	});

	it('returns no local match when an old envelope reports no active selectors', async () => {
		setSelectors('products', []);
		productDocs = [
			doc('old-plugin', {
				sku: 'ONLINE-ONLY',
				global_unique_id: 'ONLINE-ONLY',
			}),
		];

		expect(await search('ONLINE-ONLY')).toEqual([]);
	});

	it('does not match a draft product but still matches a published product', async () => {
		productDocs = [
			doc('draft', { barcode: 'DRAFT-123', status: 'draft' }),
			doc('published', { barcode: 'LIVE-123' }),
		];

		expect(await search('DRAFT-123')).toEqual([]);
		expect((await search('LIVE-123')) as unknown as FakeDoc[]).toMatchObject([{ id: 'published' }]);
	});

	it('does not match a draft variation', async () => {
		variationDocs = [
			doc('draft-variation', { barcode: 'DRAFT-VARIATION', status: 'draft' }, 'variations'),
		];

		expect(await search('DRAFT-VARIATION')).toEqual([]);
	});

	it('ignores a misfiled variation-typed document in the products collection (no false ambiguity)', async () => {
		// The dev-pro 733620209958 pollution (2026-08-20): the pre-fix products search
		// lane persisted Woo's variation-typed sku-leg rows into the PRODUCTS
		// collection, so the one variation matched once per collection and every scan
		// of its code reported "2 products found locally". The scan must resolve to
		// exactly the variations-collection document.
		productDocs = [
			doc('misfiled-variation', {
				type: 'variation',
				sku: '733620209958',
				barcode: '733620209958',
			}),
		];
		variationDocs = [
			doc('real-variation', { sku: '733620209958', barcode: '733620209958' }, 'variations'),
		];

		const results = (await search('733620209958')) as unknown as FakeDoc[];
		expect(results.map((r) => r.id)).toEqual(['real-variation']);
	});
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

	it('does not apply UPC equivalence when the active materialized carrier is SKU', async () => {
		setSelectors('products', ['sku']);
		productDocs = [doc('active-sku', { sku: '012345678905', barcode: '012345678905' })];

		expect(await search('0012345678905')).toEqual([]);
	});

	it('ranks a global-id equivalence above a coincidental exact SKU match', async () => {
		setSelectors('products', ['meta_data:_barcode']);
		productDocs = [
			// An unrelated product whose SKU is literally the scanned 13-digit string
			// (its materialized barcode carries a different custom-meta value).
			doc('sku-coincidence', { sku: '0012345678905', barcode: 'UNRELATED' }),
			// The genuine article: its global ID is the UPC-A twin of the scan.
			doc('global-equiv', { sku: 'OTHER', barcode: 'OTHER', global_unique_id: '012345678905' }),
		];

		expect((await search('0012345678905')) as unknown as FakeDoc[]).toMatchObject([
			{ id: 'global-equiv' },
		]);
	});

	it('still applies UPC equivalence to the global-id fallback when SKU is active', async () => {
		setSelectors('products', ['sku']);
		productDocs = [
			doc('global-fallback', {
				sku: 'OTHER',
				barcode: 'OTHER',
				global_unique_id: '012345678905',
			}),
		];

		expect((await search('0012345678905')) as unknown as FakeDoc[]).toMatchObject([
			{ id: 'global-fallback' },
		]);
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
