import { describe, expect, it } from 'vitest';

import { isWebHidSupported, isWebSerialSupported } from './capabilities';

describe('capability gates', () => {
	it('reports Web Serial / WebHID available on plain Chromium', () => {
		const nav = { serial: {}, hid: {}, userAgent: 'Mozilla/5.0 Chrome/120' };
		expect(isWebSerialSupported(nav)).toBe(true);
		expect(isWebHidSupported(nav)).toBe(true);
	});

	it('reports unavailable when the APIs are absent', () => {
		expect(isWebSerialSupported({ userAgent: 'Chrome' })).toBe(false);
		expect(isWebHidSupported({ userAgent: 'Chrome' })).toBe(false);
	});

	it('reports available on Electron now that main-process handlers have landed (#742)', () => {
		const nav = { serial: {}, hid: {}, userAgent: 'Mozilla/5.0 Electron/30 wcpos' };
		expect(isWebSerialSupported(nav)).toBe(true);
		expect(isWebHidSupported(nav)).toBe(true);
	});
});
