import { describe, expect, it } from 'vitest';

import { buildConnectionErrorMessage } from '../utils/connection-error';

describe('buildConnectionErrorMessage', () => {
	it('suggests the local-network permission for plain-HTTP endpoints', () => {
		const message = buildConnectionErrorMessage({
			vendorLabel: 'Star',
			url: 'http://192.168.0.25:80/StarWebPRNT/SendMessage',
			enableHint: 'ensure WebPRNT is enabled on the printer',
			plainHttpPort: 80,
		});
		expect(message).toContain('http://192.168.0.25:80/StarWebPRNT/SendMessage');
		expect(message).toContain('ensure WebPRNT is enabled on the printer');
		expect(message).toContain('permission to access devices on your local network');
		expect(message).toContain('Chrome or Edge');
		expect(message).not.toContain('certificate');
	});

	it('explains certificate setup for HTTPS endpoints', () => {
		const message = buildConnectionErrorMessage({
			vendorLabel: 'Star',
			url: 'https://192.168.4.60:443/StarWebPRNT/SendMessage',
			enableHint: 'ensure WebPRNT is enabled on the printer',
			plainHttpPort: 80,
		});
		expect(message).toContain('generate a self-signed certificate');
		expect(message).toContain('https://192.168.4.60');
		expect(message).toContain('set the port to 80');
	});

	it('uses the vendor plain-HTTP port in the HTTPS fallback hint', () => {
		const message = buildConnectionErrorMessage({
			vendorLabel: 'Epson',
			url: 'https://192.168.1.10:8043/cgi-bin/epos/service.cgi',
			enableHint: "ensure ePOS is enabled in the printer's network settings",
			plainHttpPort: 8008,
		});
		expect(message).toContain('set the port to 8008');
	});
});
