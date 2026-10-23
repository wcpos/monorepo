/**
 * The HTML was read from `src` (the receipt stage reads the page once and shows the text), so
 * `src` is its base: relative links in a template resolve against the store, as they did when
 * the frame loaded the URL itself. Same rule as the native `baseUrl`. A document that already
 * declares a `<base>` keeps it: the first base in a document wins, and the template chose it.
 */
export function withBase(html: string, base: string): string {
	if (/<base[\s/>]/i.test(html)) return html;
	const tag = `<base href="${base.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
	// A linear scan: the tag start is matched by a bounded pattern and its `>` found by index,
	// so a page with many unclosed `<head ` starts cannot make the match quadratic (CodeQL).
	const head = /<head[\s>]/i.exec(html);
	if (!head) return tag + html;
	const close = html.indexOf('>', head.index);
	if (close === -1) return tag + html;
	const end = close + 1;
	return html.slice(0, end) + tag + html.slice(end);
}
