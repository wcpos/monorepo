import { describe, expect, it } from 'vitest';

import {
	encodeSearchText,
	FLEXSEARCH_LITERAL_TERM_MAX_LENGTH,
	foldSearchText,
} from './searchIndexConfig';

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

describe('encodeSearchText', () => {
	it('splits on whitespace and drops empty strings', () => {
		expect(encodeSearchText('  Blue   Cotton\tShirt  ')).toEqual(['blue', 'cotton', 'shirt']);
	});

	it('keeps a decimal spec as one term instead of two sub-minimum digits', () => {
		expect(encodeSearchText('0.4')).toEqual(['0.4']);
		expect(encodeSearchText('ModelX 0.4')).toEqual(['modelx', '0.4']);
	});

	it('keeps punctuation inside a term, matching LIKE %term% on the server', () => {
		expect(encodeSearchText('WCP-0001-BLK')).toEqual(['wcp-0001-blk']);
		expect(encodeSearchText('3/4 K-2 v1.10')).toEqual(['3/4', 'k-2', 'v1.10']);
		expect(encodeSearchText("O'Reilly")).toEqual(["o'reilly"]);
	});

	it('strips punctuation wrapping a term, as WP_Query::parse_search_terms strips quotes', () => {
		expect(encodeSearchText("'0.4'")).toEqual(['0.4']);
		expect(encodeSearchText('(Château-du) Cèdre!')).toEqual(['chateau-du', 'cedre']);
		expect(encodeSearchText('--- ...')).toEqual([]);
	});

	it('splits a term over the literal cap on punctuation, so long emails and URLs index as before', () => {
		expect('wcp-0001-blk-xl-1'.length).toBe(FLEXSEARCH_LITERAL_TERM_MAX_LENGTH + 1);
		expect(encodeSearchText('wcp-0001-blk-xl-1')).toEqual(['wcp', '0001', 'blk', 'xl', '1']);
		expect(encodeSearchText('wcp-0001-blk-xl1')).toEqual(['wcp-0001-blk-xl1']);
		expect(encodeSearchText('firstname.lastname@example.com')).toEqual([
			'firstname',
			'lastname',
			'example',
			'com',
		]);
	});

	it('splits where WP_Query::parse_search splits: quotes, commas, and plus signs', () => {
		expect(encodeSearchText('modelX,0.4+"coil"')).toEqual(['modelx', '0.4', 'coil']);
	});
});
