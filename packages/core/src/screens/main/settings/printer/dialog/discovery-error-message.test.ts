import { formatDiscoveryError } from './discovery-error-message';
import { isWindowsPlatform } from './connection/is-windows';

const t = (_key: string, fallback: string) => fallback;

describe('formatDiscoveryError', () => {
	it('bt-none-found → mentions Bluetooth Classic', () => {
		const msg = formatDiscoveryError({ code: 'bt-none-found' }, t);
		expect(msg).toMatch(/Bluetooth Classic/);
	});

	it('bt-connect-failed → mentions Could not connect', () => {
		const msg = formatDiscoveryError({ code: 'bt-connect-failed' }, t);
		expect(msg).toMatch(/Could not connect/);
	});

	it('usb-none-found → mentions No USB printers', () => {
		const msg = formatDiscoveryError({ code: 'usb-none-found' }, t);
		expect(msg).toMatch(/No USB printers/);
	});

	it('network-none-found → mentions No network printers', () => {
		const msg = formatDiscoveryError({ code: 'network-none-found' }, t);
		expect(msg).toMatch(/No network printers/);
	});

	it('ipc-unavailable → mentions unavailable', () => {
		const msg = formatDiscoveryError({ code: 'ipc-unavailable' }, t);
		expect(msg).toMatch(/unavailable/);
	});

	it('discovery-failed with detail includes the detail string', () => {
		const msg = formatDiscoveryError({ code: 'discovery-failed', detail: 'boom' }, t);
		expect(msg).toMatch(/boom/);
	});
});

describe('isWindowsPlatform', () => {
	it('userAgentData.platform Windows → true', () => {
		expect(isWindowsPlatform({ userAgentData: { platform: 'Windows' } })).toBe(true);
	});

	it('userAgentData.platform macOS wins over platform Win32 → false', () => {
		expect(isWindowsPlatform({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe(
			false
		);
	});

	it('platform Win32 (no userAgentData) → true', () => {
		expect(isWindowsPlatform({ platform: 'Win32' })).toBe(true);
	});

	it('platform MacIntel → false', () => {
		expect(isWindowsPlatform({ platform: 'MacIntel' })).toBe(false);
	});

	it('userAgent Windows NT → true', () => {
		expect(isWindowsPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe(
			true
		);
	});

	it('userAgent Macintosh → false', () => {
		expect(
			isWindowsPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
		).toBe(false);
	});

	it('undefined → false', () => {
		expect(isWindowsPlatform(undefined)).toBe(false);
	});
});
