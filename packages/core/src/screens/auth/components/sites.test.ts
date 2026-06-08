import { getNextAccordionState, getNextExpandedSiteUuid } from './sites-expansion';

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

	it('falls back to the first remaining site when the expanded site was removed', () => {
		expect(getNextExpandedSiteUuid(['site-a', 'site-b'], ['site-b'], 'site-a')).toBe('site-b');
	});

	it('returns undefined when there are no sites to expand', () => {
		expect(getNextExpandedSiteUuid(['site-a'], [], 'site-a')).toBeUndefined();
	});
});

describe('getNextAccordionState', () => {
	it('returns the newly added site as the current expanded value in the same state transition', () => {
		expect(
			getNextAccordionState({ siteUuids: ['site-a', 'site-b'], expandedSiteUuid: 'site-a' }, [
				'site-a',
				'site-b',
				'site-c',
			])
		).toEqual({
			siteUuids: ['site-a', 'site-b', 'site-c'],
			expandedSiteUuid: 'site-c',
		});
	});

	it('returns the same reference when site UUIDs are unchanged', () => {
		const state = {
			siteUuids: ['site-a', 'site-b'],
			expandedSiteUuid: 'site-a',
		};

		expect(getNextAccordionState(state, ['site-a', 'site-b'])).toBe(state);
	});

	it('falls back to the first site when the expanded site is removed', () => {
		expect(
			getNextAccordionState({ siteUuids: ['site-a', 'site-b'], expandedSiteUuid: 'site-b' }, [
				'site-a',
			])
		).toEqual({ siteUuids: ['site-a'], expandedSiteUuid: 'site-a' });
	});

	it('preserves collapsed state when no site is added', () => {
		expect(
			getNextAccordionState({ siteUuids: ['site-a', 'site-b'], expandedSiteUuid: '' }, [
				'site-b',
				'site-a',
			])
		).toEqual({ siteUuids: ['site-b', 'site-a'], expandedSiteUuid: '' });
	});
});
