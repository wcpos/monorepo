/**
 * The HTML was read from `src` (the receipt stage reads the page once and shows the text), so
 * `src` is its base: relative links in a template resolve against the store, as they did when
 * the frame loaded the URL itself. Same rule as the native `baseUrl`. A document that already
 * declares a `<base href>` keeps it (the first base in a document wins, and the template chose
 * it), resolved against `src` when it is relative: inline HTML has no origin of its own to
 * resolve it. A `<base>` with no href sets no URL, so the page gets one injected as if it had
 * declared none.
 *
 * Both scans are linear: a tag start is matched by a bounded pattern and its `>` found by index,
 * so a page with many unclosed `<head ` or `<base ` starts cannot make a match quadratic (CodeQL).
 */
export function withBase(html: string, base: string): string {
	const declared = /<base[\s/>]/i.exec(html);
	if (declared) {
		const close = html.indexOf('>', declared.index);
		const tag = html.slice(declared.index, close === -1 ? undefined : close);
		// Double-quoted, single-quoted or unquoted, as HTML allows.
		const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
		if (href) {
			const value = href[1] ?? href[2] ?? href[3] ?? '';
			const start = declared.index + href.index;
			const attribute = `${href[0][0]}href="${escapeAttribute(resolve(value, base))}"`;
			return html.slice(0, start) + attribute + html.slice(start + href[0].length);
		}
	}
	const tag = `<base href="${escapeAttribute(base)}">`;
	const head = /<head[\s>]/i.exec(html);
	if (!head) return tag + html;
	const close = html.indexOf('>', head.index);
	if (close === -1) return tag + html;
	const end = close + 1;
	return html.slice(0, end) + tag + html.slice(end);
}

function resolve(href: string, base: string): string {
	// One pass, so `&amp;quot;` cannot be unescaped twice.
	const raw = href.replace(/&(amp|quot);/g, (_, name: string) => (name === 'amp' ? '&' : '"'));
	try {
		return new URL(raw, base).href;
	} catch {
		return raw;
	}
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
