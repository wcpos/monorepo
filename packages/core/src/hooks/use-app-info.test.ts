import { isWcposPluginCompatible } from './use-app-info';
import { MINIMUM_WCPOS_PLUGIN_VERSION } from '../utils/wcpos-plugin-version';

jest.mock('@wcpos/utils/app-info', () => ({
	AppInfo: {
		version: '1.9.0',
		platformVersion: '1.9.0',
		buildNumber: '1.9.0',
		platform: 'web',
		userAgent: 'WCPOS/1.9.0 (web)',
	},
}));

jest.mock('../contexts/app-state', () => ({ AppStateContext: undefined }));

describe('isWcposPluginCompatible', () => {
	it('accepts the first plugin release that serves the wcpos/v2 API', () => {
		expect(isWcposPluginCompatible('1.10.0')).toBe(true);
		expect(isWcposPluginCompatible('1.11.2')).toBe(true);
	});

	/**
	 * 1.9.x registers `wcpos/v1` only, so every store route this app calls is
	 * absent — the saved-site gate has to fail it, not just the connect screen.
	 */
	it('rejects plugins older than the one that serves the wcpos/v2 API', () => {
		expect(isWcposPluginCompatible('1.9.17')).toBe(false);
		expect(isWcposPluginCompatible('1.7.9')).toBe(false);
	});

	it('rejects missing or invalid plugin versions', () => {
		expect(isWcposPluginCompatible(undefined)).toBe(false);
		expect(isWcposPluginCompatible('not-a-version')).toBe(false);
	});

	/**
	 * Patch compatibility rule (roadmap RELEASE-CHECKLIST.md, 2026-10-19):
	 * every patch on a lane works with every other patch on that lane, so the
	 * plugin floor is a minor boundary. A floor like `2.0.3` would turn a patch
	 * release into a forced plugin update for every merchant on `2.0.0`–`2.0.2`.
	 */
	it('keeps the plugin floor on a minor boundary', () => {
		expect(MINIMUM_WCPOS_PLUGIN_VERSION).toMatch(/^\d+\.\d+\.0$/);
	});
});
