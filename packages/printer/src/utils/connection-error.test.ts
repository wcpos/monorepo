import { describe, expect, it } from 'vitest';

import { buildConnectionError } from './connection-error';

describe('buildConnectionError', () => {
	it('diagnostics carry the reason', () => {
		const options = {
			vendorLabel: 'Epson',
			protocolName: 'ePOS',
			url: 'http://192.168.1.10:8008/cgi-bin/epos/service.cgi',
			enableHint: 'ensure ePOS is enabled on the printer',
			plainHttpPort: 8008,
		};
		expect(buildConnectionError(options).diagnostics.reason).toBe('unreachable');
		expect(buildConnectionError({ ...options, reason: 'timeout' }).diagnostics.reason).toBe(
			'timeout'
		);
	});
});
