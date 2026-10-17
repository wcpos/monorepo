import { isSameCount } from './same-count';

describe('isSameCount', () => {
	it('treats the server-normalised echo as the same count', () => {
		expect(isSameCount({ cash: '080', card: '20' }, { card: '20.0000', cash: '80.0000' })).toBe(
			true
		);
	});
	it('differs on a changed amount, a missing tender or a non-number', () => {
		expect(isSameCount({ cash: '80' }, { cash: '70' })).toBe(false);
		expect(isSameCount({ cash: '80', card: '20' }, { cash: '80' })).toBe(false);
		expect(isSameCount({ cash: '80' }, { cash: 'eighty' })).toBe(false);
		expect(isSameCount({ cash: '80' }, null)).toBe(false);
	});
});
