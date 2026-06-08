import { getNextExpandedSiteUuid } from './sites-expansion';

describe('getNextExpandedSiteUuid', () => {
	it('expands a newly added site instead of keeping the previously expanded site', () => {
		expect(
			getNextExpandedSiteUuid(['site-a', 'site-b'], ['site-a', 'site-b', 'site-c'], 'site-a')
		).toBe('site-c');
	});

	it('keeps the current expanded site when no site was added', () => {
		expect(getNextExpandedSiteUuid(['site-a', 'site-b'], ['site-b', 'site-a'], 'site-a')).toBe(
			'site-a'
		);
	});

	it('preserves explicit collapsed state when no site was added', () => {
		expect(getNextExpandedSiteUuid(['site-a', 'site-b'], ['site-b', 'site-a'], '')).toBe('');
	});
});
