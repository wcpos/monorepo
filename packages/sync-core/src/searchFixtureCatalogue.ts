/**
 * The search fixture catalogue: one product table and one trap table that EVERY search test
 * layer asserts — the FlexSearch index, the scan fallback, the fetch walk, the plugin's SQL
 * (ported by hand to PHPUnit) and the live seam. A semantic change fails here first, by name.
 *
 * Contract (the reference matcher below IS this list): AND across terms, OR across fields
 * (name, sku, barcode), substring, shared fold, a term under FLEXSEARCH_MIN_TERM_LENGTH matches
 * as a token prefix, exact SKU / barcode rank first, descriptions never match.
 */
import { fakeUuid } from './fakePullServer';
import { encodeSearchText, FLEXSEARCH_MIN_TERM_LENGTH, foldSearchText } from './searchIndexConfig';

export type SearchFixtureProduct = {
	id: number;
	name: string;
	sku: string;
	barcode: string;
	description: string;
	stockStatus: 'instock' | 'outofstock';
};

export type SearchFixtureTrap = {
	name: string;
	query: string;
	/** Exact sku/barcode matches first, then id descending — the server's order. */
	expectedIds: number[];
	why: string;
};

/** WooCommerce's GTIN field, the barcode field a default store searches. */
export const SEARCH_FIXTURE_BARCODE_FIELD = 'global_unique_id';

const product = (
	id: number,
	name: string,
	extra: Partial<Omit<SearchFixtureProduct, 'id' | 'name'>> = {}
): SearchFixtureProduct => ({
	id,
	name,
	sku: extra.sku ?? `SKU-${id}`,
	barcode: extra.barcode ?? '',
	description: extra.description ?? '',
	stockStatus: extra.stockStatus ?? 'instock',
});

// 130 rows for one common word: more than the Woo per-page maximum, so a walk needs
// three pages of 50 and a capped window (the 2026-09-10 bug) never exhausts.
const BULK = Array.from({ length: 130 }, (_, i) => product(1000 + i, `Bulk Widget ${1000 + i}`));

export const SEARCH_FIXTURE_PRODUCTS: readonly SearchFixtureProduct[] = [
	...BULK,
	product(2001, 'Banana Berry Smoothie'),
	product(2002, 'Banana Bread'),
	product(2003, 'Berry Tart'),
	product(2004, 'Strawberry Banana Split'), // "Strawberry" contains "berry": both terms match
	product(3001, 'Crème Brûlée Kit'),
	product(3002, 'Škoda Model Car'),
	product(3003, 'Skateboard Deck'),
	product(3004, 'Poster', { sku: 'RED-1' }),
	product(3005, 'RED-1 Edition Poster'),
	product(3006, 'Scanner Test Item', { barcode: '5012345678900' }),
	product(3007, 'Manual for 5012345678900'),
	product(3008, 'K2 Skis'),
	product(3009, 'Plain Mug', { description: 'A phantom word lives only in the description.' }),
	product(3010, 'Ghost Pepper Sauce', { stockStatus: 'outofstock' }),
];

const byId = new Map(SEARCH_FIXTURE_PRODUCTS.map((p) => [p.id, p]));

export function searchFixtureBlob(p: SearchFixtureProduct): string {
	return `${p.name} ${p.sku} ${p.barcode}`.trim();
}

function fields(p: SearchFixtureProduct): string[] {
	return [p.name, p.sku, p.barcode].map(foldSearchText);
}

export function searchFixtureMatches(p: SearchFixtureProduct, query: string): boolean {
	const folded = foldSearchText(query).trim();
	if (!folded) return false;
	if (folded.length < FLEXSEARCH_MIN_TERM_LENGTH) {
		// Short terms match as a token prefix (the client's short-prefix path; LIKE %term% on
		// the server is broader, and the fixture keeps every short-term trap prefix-anchored).
		return fields(p).some((field) => field.split(/\s+/).some((token) => token.startsWith(folded)));
	}
	const tokens = encodeSearchText(query).filter((t) => t.length >= FLEXSEARCH_MIN_TERM_LENGTH);
	const blob = fields(p).join(' ');
	return tokens.every((token) => blob.includes(token));
}

function exactRank(p: SearchFixtureProduct, query: string): number {
	const folded = foldSearchText(query).trim();
	return foldSearchText(p.sku) === folded ||
		(p.barcode !== '' && foldSearchText(p.barcode) === folded)
		? 0
		: 1;
}

export function searchFixtureExpectedIds(query: string): number[] {
	return SEARCH_FIXTURE_PRODUCTS.filter((p) => searchFixtureMatches(p, query))
		.sort((a, b) => exactRank(a, query) - exactRank(b, query) || b.id - a.id)
		.map((p) => p.id);
}

// prettier-ignore
export const SEARCH_FIXTURE_TRAPS: readonly SearchFixtureTrap[] = [
	{ name: 'over-100-hits', query: 'widget', expectedIds: BULK.map((p) => p.id).reverse(), why: 'more hits than one Woo page; a capped window never exhausts' },
	{ name: 'and-across-terms', query: 'banana berry', expectedIds: [2004, 2001], why: 'plugin <= 1.10.7 ORed terms and returned 2002/2003 too' },
	{ name: 'accent-fold', query: 'creme', expectedIds: [3001], why: 'fold strips combining marks on both sides' },
	{ name: 'unicode-fold', query: 'skoda', expectedIds: [3002], why: 'Š folds to s' },
	{ name: 'compound-substring', query: 'board', expectedIds: [3003], why: "tokenize:'full' — LIKE %term% parity" },
	{ name: 'exact-sku-first', query: 'RED-1', expectedIds: [3004, 3005], why: 'the exact sku outranks a newer title match' },
	{ name: 'exact-barcode-first', query: '5012345678900', expectedIds: [3006, 3007], why: 'the exact barcode outranks a newer title match' },
	{ name: 'short-term-prefix', query: 'k2', expectedIds: [3008], why: 'under the index minimum: token-prefix locally, still sent to the server (#1681)' },
	{ name: 'description-never-matches', query: 'phantom', expectedIds: [], why: 'v2 matched descriptions in 1.10.0-1.10.5 (#1777)' },
	{ name: 'stock-status-is-not-search', query: 'ghost', expectedIds: [3010], why: 'search ignores stock; the grid filter is a separate concern' },
	{ name: 'no-match', query: 'zzqx', expectedIds: [], why: 'the only honest "no products found"' },
];

export function searchFixturePayload(p: SearchFixtureProduct): Record<string, unknown> {
	return {
		id: p.id,
		name: p.name,
		slug: `fixture-${p.id}`,
		sku: p.sku,
		[SEARCH_FIXTURE_BARCODE_FIELD]: p.barcode,
		description: p.description,
		short_description: '',
		type: 'simple',
		status: 'publish',
		parent_id: 0,
		stock_status: p.stockStatus,
		manage_stock: false,
		stock_quantity: null,
		price: '10',
		regular_price: '10',
		sale_price: '',
		on_sale: false,
		featured: false,
		date_created_gmt: '2026-09-01T00:00:00',
		date_modified_gmt: '2026-09-01T00:00:00',
		permalink: `https://example.invalid/product/fixture-${p.id}`,
		images: [],
		categories: [],
		tags: [],
		brands: [],
		attributes: [],
		variations: [],
		meta_data: [{ id: 5_000_000 + p.id, key: '_woocommerce_pos_uuid', value: fakeUuid(p.id) }],
	};
}

export function searchFixtureProduct(id: number): SearchFixtureProduct {
	const p = byId.get(id);
	if (!p) throw new Error(`search fixture: no product ${id}`);
	return p;
}
