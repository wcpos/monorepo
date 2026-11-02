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

	it('keeps an absolute base the document already declares', () => {
		const html = '<html><head><base href="https://cdn.test/"><title>R</title></head></html>';
		expect(withBase(html, 'https://s.test/r')).toBe(html);
	});

	it('resolves a relative declared base against the page URL', () => {
		expect(
			withBase(
				'<head><base target="_top" href="/receipts/?a=1&amp;b=2"></head>',
				'https://s.test/r/x'
			)
		).toBe('<head><base target="_top" href="https://s.test/receipts/?a=1&amp;b=2"></head>');
	});

	it('injects the base when the declared one has no href', () => {
		expect(withBase('<head><base target="_top"><p>R</p></head>', 'https://s.test/r')).toBe(
			'<head><base href="https://s.test/r"><base target="_top"><p>R</p></head>'
		);
	});

	it('resolves a single-quoted or unquoted declared href', () => {
		expect(withBase("<base href='images/'>", 'https://s.test/r/x')).toBe(
			'<base href="https://s.test/r/images/">'
		);
		expect(withBase('<base href=images/ target=_top>', 'https://s.test/r/x')).toBe(
			'<base href="https://s.test/r/images/" target=_top>'
		);
	});

	it('unescapes a declared href once', () => {
		expect(withBase('<base href="/r?q=&amp;quot;">', 'https://s.test/')).toBe(
			'<base href="https://s.test/r?q=&amp;quot;">'
		);
	});

	it('prepends the base when the head tag never closes', () => {
		expect(withBase('<head', 'https://s.test/r')).toBe('<base href="https://s.test/r"><head');
	});
});
