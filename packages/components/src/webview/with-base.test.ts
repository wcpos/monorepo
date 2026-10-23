import { withBase } from './with-base';

describe('withBase', () => {
	it('injects the base right after an opening head tag', () => {
		expect(withBase('<html><HEAD id="h"><title>R</title></HEAD></html>', 'https://s.test/r')).toBe(
			'<html><HEAD id="h"><base href="https://s.test/r"><title>R</title></HEAD></html>'
		);
	});

	it('prepends the base when there is no head', () => {
		expect(withBase('<p>R</p>', 'https://s.test/r')).toBe('<base href="https://s.test/r"><p>R</p>');
	});

	it('escapes ampersands and quotes in the URL', () => {
		expect(withBase('<p>R</p>', 'https://s.test/r?a=1&b="x"')).toBe(
			'<base href="https://s.test/r?a=1&amp;b=&quot;x&quot;"><p>R</p>'
		);
	});

	it('keeps a base the document already declares', () => {
		const html = '<html><head><base href="https://cdn.test/"><title>R</title></head></html>';
		expect(withBase(html, 'https://s.test/r')).toBe(html);
	});

	it('prepends the base when the head tag never closes', () => {
		expect(withBase('<head', 'https://s.test/r')).toBe('<base href="https://s.test/r"><head');
	});
});
