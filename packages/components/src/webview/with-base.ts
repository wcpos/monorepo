/**
 * The HTML was read from `src` (the receipt stage reads the page once and shows the text), so
 * `src` is its base: relative links in a template resolve against the store, as they did when
 * the frame loaded the URL itself. Same rule as the native `baseUrl`.
 */
export function withBase(html: string, base: string): string {
	const tag = `<base href="${base.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
	const head = /<head(\s[^>]*)?>/i.exec(html);
	if (!head) return tag + html;
	const end = head.index + head[0].length;
	return html.slice(0, end) + tag + html.slice(end);
}
