import { describe, expect, it } from 'vitest';

import {
	allowedOriginsFromEnv,
	isRawTcpClientAddressAllowed,
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
		expect(
			shouldForwardCookies('http://localhost:8888/wp-admin', ' http://localhost:8888/path ')
		).toBe(true);
		expect(shouldForwardCookies('https://store.example/wp-admin', 'http://localhost:8888')).toBe(
			false
		);
	});

	it('allows raw TCP printing from loopback and private LAN browser clients', () => {
		expect(isRawTcpClientAddressAllowed('::1')).toBe(true);
		expect(isRawTcpClientAddressAllowed('::ffff:127.0.0.1')).toBe(true);
		expect(isRawTcpClientAddressAllowed('192.168.1.20')).toBe(true);
		expect(isRawTcpClientAddressAllowed('::ffff:192.168.1.20')).toBe(true);
		expect(isRawTcpClientAddressAllowed('10.0.0.5')).toBe(true);
		expect(isRawTcpClientAddressAllowed('172.16.0.5')).toBe(true);
		expect(isRawTcpClientAddressAllowed('172.31.255.255')).toBe(true);
		expect(isRawTcpClientAddressAllowed('172.32.0.1')).toBe(false);
		expect(isRawTcpClientAddressAllowed('8.8.8.8')).toBe(false);
	});
});
