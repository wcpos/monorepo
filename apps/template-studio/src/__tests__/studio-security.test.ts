import { describe, expect, it } from 'vitest';

import {
	allowedHostsFromEnv,
	allowedOriginsFromEnv,
	isLoopbackAddress,
	isPrintHostAllowed,
	isStoreOriginAllowed,
	shouldForwardCookies,
} from '../../scripts/studio-security';

describe('Template Studio dev-server security helpers', () => {
	it('allows only configured store origins and forwards cookies only to the configured proxy origin', () => {
		const origins = allowedOriginsFromEnv(
			'https://store.example, http://localhost:9999/path',
			'http://localhost:8888'
		);

		expect(origins).toEqual(['https://store.example', 'http://localhost:9999']);
		expect(isStoreOriginAllowed('https://store.example/wp-admin', origins)).toBe(true);
		expect(isStoreOriginAllowed('https://attacker.example', origins)).toBe(false);
		expect(shouldForwardCookies('http://localhost:8888/wp-admin', 'http://localhost:8888')).toBe(
			true
		);
		expect(shouldForwardCookies('https://store.example/wp-admin', 'http://localhost:8888')).toBe(
			false
		);
	});

	it('limits raw TCP printing to loopback clients and allowlisted simulator hosts', () => {
		expect(isLoopbackAddress('::1')).toBe(true);
		expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
		expect(isLoopbackAddress('192.168.1.20')).toBe(false);

		expect(isPrintHostAllowed('127.0.0.1', allowedHostsFromEnv(undefined))).toBe(true);
		expect(isPrintHostAllowed('printer.local', allowedHostsFromEnv(undefined))).toBe(false);
		expect(isPrintHostAllowed('printer.local', allowedHostsFromEnv('printer.local'))).toBe(true);
	});
});
