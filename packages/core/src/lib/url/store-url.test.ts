import * as fs from 'fs';
import * as path from 'path';

import { URL_IMPLEMENTATIONS, withGlobalUrl } from '../../../jest/url-implementations';
import { asciiHost, normalizeStoreUrl } from './store-url';

// If Expo moves its native URL elsewhere, point URL_IMPLEMENTATIONS at the new implementation.
describe('expo native URL source', () => {
	it('uses the URL implementation installed by Expo on native', () => {
		const expoDir = path.dirname(require.resolve('expo/package.json'));
		expect(fs.readFileSync(path.join(expoDir, 'src/winter/url.ts'), 'utf8')).toContain(
			"from 'whatwg-url-minimum'"
		);
		expect(fs.readFileSync(path.join(expoDir, 'src/winter/runtime.native.ts'), 'utf8')).toContain(
			"install('URL', () => require('./url').URL)"
		);
	});
});

describe.each(URL_IMPLEMENTATIONS)('%s', (_, impl) => {
	withGlobalUrl(impl);

	describe('asciiHost', () => {
		it.each([
			['münchen-laden.de', 'xn--mnchen-laden-dlb.de'],
			['Bücher.example', 'xn--bcher-kva.example'],
			['例え.テスト', 'xn--r8jz45g.xn--zckzah'],
			['exаmple.com', 'xn--exmple-4nf.com'], // Cyrillic а: mixed script is converted.
			['a\u200Db.com', 'a\u200Db.com'], // TR-46 rejects the zero-width joiner.
			['Example.COM:8443', 'Example.COM:8443'],
			['xn--mnchen-laden-dlb.de', 'xn--mnchen-laden-dlb.de'],
		])('converts %s to %s', (host, expected) => {
			expect(asciiHost(host)).toBe(expected);
		});
	});

	describe('normalizeStoreUrl', () => {
		it.each([
			['münchen-laden.de', 'https://xn--mnchen-laden-dlb.de'],
			['http://Bücher.example/shop/', 'https://xn--bcher-kva.example/shop'],
			['  https://例え.テスト/', 'https://xn--r8jz45g.xn--zckzah'],
			['a\u200Db.com', 'https://a\u200Db.com'],
			['example.com', 'https://example.com'],
			['HTTP://Example.com/staging//', 'https://Example.com/staging'],
			['https://example.com:8443/?rest_route=/', 'https://example.com:8443/?rest_route='],
		])('normalizes %s to %s', (url, expected) => {
			expect(normalizeStoreUrl(url)).toBe(expected);
		});
	});
});
