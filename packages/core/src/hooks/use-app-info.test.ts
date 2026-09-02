import { isWcposPluginCompatible } from './use-app-info';

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
	it('accepts the first plugin release whose v2 search covers SKU and barcode and ranks exact matches first', () => {
		expect(isWcposPluginCompatible('1.10.7')).toBe(false);
		expect(isWcposPluginCompatible('1.10.8')).toBe(true);
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
});
