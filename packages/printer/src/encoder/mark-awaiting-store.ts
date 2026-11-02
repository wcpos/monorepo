/**
 * The till's "awaiting store" line: the first printed line of a receipt the store has not heard
 * yet (ADR 0040 Decided 1 rule 1: the cashier, and the paper, are never unaware). One module for
 * both engines, which every print path runs through.
 */
const escape = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A rendered HTML receipt: `renderPreview` returns body content, so the line is prepended. */
export const markAwaitingStore = (html: string, text: string) =>
	`<p class="wcpos-awaiting-store" style="text-align:center;font-weight:700;margin:0 0 8px">${escape(text)}</p>${html}`;

/** A thermal template: the first child of `<receipt>`, bold and centred in the encoder's elements. */
export function markAwaitingStoreXml(xml: string, text: string): string {
	const line = `<align mode="center"><bold><text>${escape(text)}</text></bold></align>`;
	// The first `<receipt` tag outside a comment: a leading `<!-- … <receipt> -->` is skipped.
	for (let at = xml.indexOf('<receipt'); at !== -1; at = xml.indexOf('<receipt', at + 1)) {
		if (xml.lastIndexOf('<!--', at) > xml.lastIndexOf('-->', at)) continue;
		if (!/[\s/>]/.test(xml[at + 8] ?? '')) continue;
		const close = xml.indexOf('>', at);
		if (close !== -1) return xml.slice(0, close + 1) + line + xml.slice(close + 1);
	}
	return line + xml;
}
