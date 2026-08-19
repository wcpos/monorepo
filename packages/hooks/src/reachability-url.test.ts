import { pingProbeUrl } from './reachability-url';

describe('pingProbeUrl', () => {
	it.each([
		['https://site.com/wp-json/', 'https://site.com/wp-json/wcpos/v2/ping?wcpos=1'],
		['https://site.com/wp-json', 'https://site.com/wp-json/wcpos/v2/ping?wcpos=1'],
		['https://site.com/?rest_route=/', 'https://site.com/?rest_route=/wcpos/v2/ping&wcpos=1'],
		['https://site.com/?rest_route=', 'https://site.com/?rest_route=/wcpos/v2/ping&wcpos=1'],
	])('maps %s to the cheap ping route', (wpAPIURL, expected) => {
		expect(pingProbeUrl(wpAPIURL)).toBe(expected);
	});
});
