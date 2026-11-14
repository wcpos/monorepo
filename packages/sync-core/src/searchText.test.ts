import { describe, expect, it } from 'vitest';

import { foldSearchText, searchTerms } from './searchText';

describe('foldSearchText', () => {
	it('lowercases search text', () => {
		expect(foldSearchText('CEDRE')).toBe('cedre');
	});

	it('strips accents', () => {
		expect(foldSearchText('Château du Cèdre')).toBe('chateau du cedre');
	});

	it('folds NFD and NFC input identically', () => {
		expect(foldSearchText('Cèdre'.normalize('NFD'))).toBe(foldSearchText('Cèdre'.normalize('NFC')));
	});
});

describe('searchTerms', () => {
	it('splits on whitespace and drops empty strings', () => {
		expect(searchTerms('  Blue\u00a0Cotton\u3000Shirt\t ')).toEqual(['blue', 'cotton', 'shirt']);
	});

	it('keeps a decimal spec as one term', () => {
		expect(searchTerms('0.4')).toEqual(['0.4']);
		expect(searchTerms('0,4')).toEqual(['0,4']);
		expect(searchTerms('ModelX 0.4')).toEqual(['modelx', '0.4']);
	});

	it('keeps punctuation inside a term, matching LIKE %term% on the server', () => {
		expect(searchTerms('WCP-0001-BLK')).toEqual(['wcp-0001-blk']);
		expect(searchTerms('3/4 K-2 v1.10')).toEqual(['3/4', 'k-2', 'v1.10']);
		expect(searchTerms("O'Reilly")).toEqual(["o'reilly"]);
	});

	it('strips punctuation wrapping a term', () => {
		expect(searchTerms("'0.4'")).toEqual(['0.4']);
		expect(searchTerms('(Château-du) Cèdre!')).toEqual(['chateau-du', 'cedre']);
		expect(searchTerms('--- ...')).toEqual([]);
	});

	it('keeps a long term whole — an email or a long sku is one literal substring (#2411)', () => {
		expect(searchTerms('wcp-0001-blk-xl-1')).toEqual(['wcp-0001-blk-xl-1']);
		expect(searchTerms('firstname.lastname@example.com')).toEqual([
			'firstname.lastname@example.com',
		]);
	});

	it('keeps internal quotes, commas, and plus signs literal', () => {
		expect(searchTerms('a,b')).toEqual(['a,b']);
		expect(searchTerms('a"b c+d')).toEqual(['a"b', 'c+d']);
	});
});
