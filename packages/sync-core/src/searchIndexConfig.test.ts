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
	it('splits on spaces, punctuation, and symbols and drops empty strings', () => {
		expect(encodeSearchText('  Château-du+Cèdre!  ')).toEqual(['chateau', 'du', 'cedre']);
	});
});
