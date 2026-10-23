const CLASS = 'wcpos-awaiting-store';

/**
 * The till's "awaiting store" line, the first printable line of a receipt the store has not
 * heard yet (ADR 0040 Decided 1 rule 1: the cashier, and the paper, are never unaware). Inserted
 * right after the opening `<body…>` tag, or at the start when there is none. Idempotent: a
 * document that already carries the line is returned as is. Linear scan, as `withBase`.
 */
export function markAwaitingStore(html: string, text: string): string {
	if (html.includes(`class="${CLASS}"`)) return html;
	const line = `<p class="${CLASS}" style="text-align:center;font-weight:700;margin:0 0 8px">${escapeText(text)}</p>`;
	const body = /<body[\s>]/i.exec(html);
	const close = body ? html.indexOf('>', body.index) : -1;
	if (close === -1) return line + html;
	return html.slice(0, close + 1) + line + html.slice(close + 1);
}

function escapeText(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
