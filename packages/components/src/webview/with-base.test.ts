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
});
