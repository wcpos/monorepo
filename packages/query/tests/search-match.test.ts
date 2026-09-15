import { foldSearchText } from '@wcpos/sync-core';
import { SEARCH_FIXTURE_PRODUCTS, SEARCH_FIXTURE_TRAPS } from '@wcpos/sync-core/testing';

import {
	fieldsMatchPhrase,
	fieldsMatchSearch,
	fieldsMatchShortPrefix,
	phraseSearchAnchor,
} from '../src/search-match';

describe('product phrase matcher', () => {
	it.each(SEARCH_FIXTURE_TRAPS.map((t) => [t.name, t] as const))('%s', (_name, trap) => {
		const ids = SEARCH_FIXTURE_PRODUCTS.filter((p) =>
			fieldsMatchPhrase([p.name, p.sku, p.barcode], foldSearchText(trap.query))
		).map((p) => p.id);
		expect(ids.sort((a, b) => a - b)).toEqual([...trap.expectedIds].sort((a, b) => a - b));
	});
	it.each([
		['MY საბარგული', ['xxxx MY საბარგული xxxx'], true, 'საბარგული'],
		['MY საბარგული', ['M3 საბარგული'], false, 'საბარგული'],
		['MY საბარგული', ['საბარგული MY'], false, 'საბარგული'],
		['MY საბარგული', ['MY xxxx საბარგული'], false, 'საბარგული'],
		['MY საბარგული', ['MY', 'საბარგული'], false, 'საბარგული'],
		['A', ['CAB'], true, null],
		['MY', ['xxMYxx'], true, null],
		['A B', ['xxA Bxx'], true, null],
		['0.4', ['abcdefghijklmnop0.4'], true, null],
		['mnop-blue', ['abcdefghijklmnop-blue'], true, 'mnop'],
		['MY  საბარგული', ['MY საბარგული'], false, 'საბარგული'],
		['MY+საბარგული', ['MY საბარგული'], false, 'საბარგული'],
		['%30', ['%30'], true, null],
		['東京 コー', ['東京 コーヒー'], true, null],
	] as const)('matches %s literally in %j', (query, fields, matches, anchor) => {
		const folded = foldSearchText(query);
		expect(fieldsMatchPhrase([...fields], folded)).toBe(matches);
		expect(phraseSearchAnchor(folded)).toBe(anchor);
	});
	it('retains token AND and short-prefix helpers for non-product collections', () => {
		expect(fieldsMatchSearch(['Berry', 'Banana'], 'banana berry')).toBe(true);
		expect(fieldsMatchShortPrefix(['CAB'], 'a')).toBe(false);
	});
});
