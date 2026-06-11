import { describe, expect, it } from 'vitest';

import { withTargetAddressSpace } from '../utils/local-fetch';

describe('withTargetAddressSpace', () => {
	it('annotates plain-HTTP URLs as local network targets', () => {
		const init = withTargetAddressSpace('http://192.168.0.25:80/StarWebPRNT/SendMessage', {
			method: 'POST',
		});
		expect(init).toMatchObject({ method: 'POST', targetAddressSpace: 'local' });
	});

	it('annotates plain-HTTP hostnames (not just IP literals)', () => {
		const init = withTargetAddressSpace('http://printer.local:8008/cgi-bin/epos/service.cgi', {
			method: 'GET',
		});
		expect(init).toMatchObject({ targetAddressSpace: 'local' });
	});

	it('leaves HTTPS URLs untouched', () => {
		const init = withTargetAddressSpace('https://192.168.0.25:443/StarWebPRNT/SendMessage', {
			method: 'POST',
		});
		expect('targetAddressSpace' in init).toBe(false);
	});

	it.each(['http://localhost:9100/', 'http://127.0.0.1/', 'http://[::1]:80/'])(
		'leaves loopback URL %s untouched',
		(url) => {
			const init = withTargetAddressSpace(url, {});
			expect('targetAddressSpace' in init).toBe(false);
		}
	);

	it('returns the init unchanged for unparseable URLs', () => {
		const init = { method: 'POST' };
		expect(withTargetAddressSpace('not a url', init)).toBe(init);
	});
});
