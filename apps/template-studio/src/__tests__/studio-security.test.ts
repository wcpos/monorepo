import { describe, expect, it } from 'vitest';

import {
	allowedOriginsFromEnv,
	allowedPrintDestinationsFromEnv,
	isLoopbackAddress,
	isPrintDestinationAllowed,
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

	it('limits raw TCP printing to loopback clients and allowlisted printer destinations', () => {
		expect(isLoopbackAddress('::1')).toBe(true);
		expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
		expect(isLoopbackAddress('192.168.1.20')).toBe(false);

		expect(
			isPrintDestinationAllowed('127.0.0.1', 9100, allowedPrintDestinationsFromEnv(undefined))
		).toBe(true);
		expect(
			isPrintDestinationAllowed('127.0.0.1', 6379, allowedPrintDestinationsFromEnv(undefined))
		).toBe(false);
		expect(
			isPrintDestinationAllowed('printer.local', 9100, allowedPrintDestinationsFromEnv(undefined))
		).toBe(false);
		expect(
			isPrintDestinationAllowed(
				'printer.local',
				9100,
				allowedPrintDestinationsFromEnv('printer.local:9100')
			)
		).toBe(true);
	});
});
