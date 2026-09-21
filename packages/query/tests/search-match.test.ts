import { SEARCH_FIXTURE_PRODUCTS, SEARCH_FIXTURE_TRAPS } from '@wcpos/sync-core/testing';

import {
	fieldsMatchAllTerms,
	fieldsMatchSearch,
	fieldsMatchShortPrefix,
	searchTerms,
} from '../src/search-match';

describe('product all-term matcher', () => {
	it.each(SEARCH_FIXTURE_TRAPS.map((t) => [t.name, t] as const))('%s', (_name, trap) => {
		const ids = SEARCH_FIXTURE_PRODUCTS.filter((p) =>
			fieldsMatchAllTerms([p.name, p.sku, p.barcode], searchTerms(trap.query))
		).map((p) => p.id);
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
	] as const)('matches every term of %s in %j', (query, fields, matches) => {
		expect(fieldsMatchAllTerms([...fields], searchTerms(query))).toBe(matches);
	});
	it('keeps short terms and strips wrapping punctuation without splitting decimal commas', () => {
		expect(searchTerms('MY A (საბარგული) 0,4')).toEqual(['my', 'a', 'საბარგული', '0,4']);
		expect(searchTerms('--- ...')).toEqual([]);
	});
	it('retains token AND and short-prefix helpers for non-product collections', () => {
		expect(fieldsMatchSearch(['Berry', 'Banana'], 'banana berry')).toBe(true);
		expect(fieldsMatchShortPrefix(['CAB'], 'a')).toBe(false);
	});
});
