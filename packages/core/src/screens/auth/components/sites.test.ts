import { getNextExpandedSiteUuid } from './sites-expansion';

describe('getNextExpandedSiteUuid', () => {
	it('expands a newly added site instead of keeping the previously expanded site', () => {
		expect(
			getNextExpandedSiteUuid(['site-a', 'site-b'], ['site-a', 'site-b', 'site-c'], 'site-a')
		).toBe('site-c');
	});
});
