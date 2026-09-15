import { foldSearchText } from '@wcpos/sync-core';
import { SEARCH_FIXTURE_PRODUCTS, SEARCH_FIXTURE_TRAPS } from '@wcpos/sync-core/testing';

import {
	fieldsMatchAllTerms,
	fieldsMatchSearch,
	fieldsMatchShortPrefix,
	phraseSearchAnchor,
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
		['MY საბარგული', ['xxxx MY საბარგული xxxx'], true, 'საბარგული'],
		['MY საბარგული', ['M3 საბარგული'], false, 'საბარგული'],
		['MY საბარგული', ['საბარგული MY'], true, 'საბარგული'],
		['MY საბარგული', ['MY xxxx საბარგული'], true, 'საბარგული'],
		['MY საბარგული', ['MY', 'საბარგული'], true, 'საბარგული'],
		['A', ['CAB'], true, null],
		['MY', ['xxMYxx'], true, null],
		['A B', ['xxA Bxx'], true, null],
		['A B', ['xxB gap Axx'], true, null],
		['banana berry', ['Strawberry Banana Split'], true, 'banana'],
		['berry banana', ['Banana Berry Smoothie'], true, 'banana'],
		['banana smoothie', ['Banana Berry Smoothie'], true, 'smoothie'],
		['0,4', ['Coil 0,4 ohm'], true, null],
		['0,4', ['Coil 0.4 ohm'], false, null],
		['cobalt zinc', ['Cobalt Lamp', 'ZINC-77'], true, 'cobalt'],
		['', ['anything'], false, null],
		['word', [], false, 'word'],
		['0.4', ['abcdefghijklmnop0.4'], true, null],
		['mnop-blue', ['abcdefghijklmnop-blue'], true, 'mnop'],
		['MY  საბარგული', ['MY საბარგული'], true, 'საბარგული'],
		['MY+საბარგული', ['MY საბარგული'], false, 'საბარგული'],
		['%30', ['%30'], true, null],
		['東京 コー', ['東京 コーヒー'], true, null],
	] as const)('matches every term of %s in %j', (query, fields, matches, anchor) => {
		const folded = foldSearchText(query);
		expect(fieldsMatchAllTerms([...fields], searchTerms(query))).toBe(matches);
		expect(phraseSearchAnchor(folded)).toBe(anchor);
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
