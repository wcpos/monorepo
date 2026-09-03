import { describe, expect, it } from 'vitest';

import { encodeSearchText, foldSearchText } from './searchIndexConfig';

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
		expect(encodeSearchText('Château-du Cèdre!')).toEqual(['chateau-du', 'cedre!']);
	});

	it('splits where WP_Query::parse_search splits: quotes, commas, and plus signs', () => {
		expect(encodeSearchText('modelX,0.4+"coil"')).toEqual(['modelx', '0.4', 'coil']);
	});
});
