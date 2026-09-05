import { DEFAULT_APP_SCHEME, schemeForApplicationId } from './scheme';

describe('schemeForApplicationId', () => {
	// One scheme per EAS build profile; the triples live in apps/main/app.config.ts.
	it.each([
		['com.wcpos.main', 'wcpos'],
		['com.wcpos.main.dev', 'wcpos-dev'],
		['com.wcpos.main.adhoc', 'wcpos-adhoc'],
	])('maps %s to %s', (applicationId, scheme) => {
		expect(schemeForApplicationId(applicationId)).toBe(scheme);
	});

	it('falls back to the store scheme when the id is unknown or unavailable', () => {
		expect(schemeForApplicationId(null)).toBe(DEFAULT_APP_SCHEME);
		expect(schemeForApplicationId(undefined)).toBe(DEFAULT_APP_SCHEME);
		expect(schemeForApplicationId('com.example.other')).toBe(DEFAULT_APP_SCHEME);
	});
});
