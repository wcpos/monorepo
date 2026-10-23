import { markAwaitingStore } from './mark-awaiting-store';

const line =
	'<p class="wcpos-awaiting-store" style="text-align:center;font-weight:700;margin:0 0 8px">Awaiting store</p>';

describe('markAwaitingStore', () => {
	it('inserts the line right after a body tag with attributes', () => {
		expect(
			markAwaitingStore('<html><BODY class="r"><h1>R</h1></BODY></html>', 'Awaiting store')
		).toBe(`<html><BODY class="r">${line}<h1>R</h1></BODY></html>`);
	});

	it('prepends the line when there is no body', () => {
		expect(markAwaitingStore('<h1>R</h1>', 'Awaiting store')).toBe(`${line}<h1>R</h1>`);
	});

	it('is idempotent', () => {
		const once = markAwaitingStore('<body><h1>R</h1></body>', 'Awaiting store');
		expect(markAwaitingStore(once, 'Awaiting store')).toBe(once);
	});

	it('escapes the text', () => {
		expect(markAwaitingStore('', 'A & <b>')).toContain('>A &amp; &lt;b&gt;</p>');
	});
});
