import { searchTerms } from '@wcpos/sync-core';
import { SEARCH_FIXTURE_PRODUCTS, SEARCH_FIXTURE_TRAPS } from '@wcpos/sync-core/testing';

import { searchRowText } from '../src/search-fields';
import { searchRows } from '../src/search-blob';

/** One folded row per field list, searched through the blob's real core. */
function matches(fields: readonly string[], query: string): boolean {
	const rows = new Map([['row', searchRowText(['text'], { text: fields.join(' ') })]]);
	return searchRows(rows, searchTerms(query)).length === 1 && searchTerms(query).length > 0;
}

describe('search blob all-term matcher', () => {
	it.each(SEARCH_FIXTURE_TRAPS.map((t) => [t.name, t] as const))('%s', (_name, trap) => {
		const rows = new Map(
			SEARCH_FIXTURE_PRODUCTS.map((p) => [
				String(p.id),
				searchRowText(['name', 'sku', 'barcode'], p),
			])
		);
		const ids = searchRows(rows, searchTerms(trap.query)).map(Number);
		expect(ids.sort((a, b) => a - b)).toEqual([...trap.expectedIds].sort((a, b) => a - b));
	});
	it.each([
		['MY საბარგული', ['xxxx MY საბარგული xxxx'], true],
		['MY საბარგული', ['M3 საბარგული'], false],
		['MY საბარგული', ['საბარგული MY'], true],
		['MY საბარგული', ['MY xxxx საბარგული'], true],
		['MY საბარგული', ['MY', 'საბარგული'], true],
		['A', ['CAB'], true],
		['MY', ['xxMYxx'], true],
		['A B', ['xxA Bxx'], true],
		['A B', ['xxB gap Axx'], true],
		['banana berry', ['Strawberry Banana Split'], true],
		['berry banana', ['Banana Berry Smoothie'], true],
		['banana smoothie', ['Banana Berry Smoothie'], true],
		['0,4', ['Coil 0,4 ohm'], true],
		['0,4', ['Coil 0.4 ohm'], false],
		['cobalt zinc', ['Cobalt Lamp', 'ZINC-77'], true],
		['', ['anything'], false],
		['word', [], false],
		['0.4', ['abcdefghijklmnop0.4'], true],
		['mnop-blue', ['abcdefghijklmnop-blue'], true],
		['MY  საბარგული', ['MY საბარგული'], true],
		['MY+საბარგული', ['MY საბარგული'], false],
		['%30', ['%30'], true],
		['東京 コー', ['東京 コーヒー'], true],
	] as const)('matches every term of %s in %j', (query, fields, expected) => {
		expect(matches(fields, query)).toBe(expected);
	});
});
