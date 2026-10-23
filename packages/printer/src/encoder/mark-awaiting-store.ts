/**
 * The thermal twin of components' `markAwaitingStore`: the till's "awaiting store" line as the
 * first printed line of a receipt the store has not heard yet (ADR 0040 Decided 1 rule 1), bold
 * and centred in the encoder's own elements, the way the default template prints its reprint
 * banner. Inserted right after the opening `<receipt…>` tag, or at the start when there is none.
 * Idempotent: a template that already carries the line is returned as is.
 */
export function markAwaitingStoreXml(xml: string, text: string): string {
	const line = `<align mode="center"><bold><text>${escapeXml(text)}</text></bold></align>`;
	if (xml.includes(line)) return xml;
	const receipt = /<receipt[\s>/]/i.exec(xml);
	const close = receipt ? xml.indexOf('>', receipt.index) : -1;
	if (close === -1) return line + xml;
	return xml.slice(0, close + 1) + line + xml.slice(close + 1);
}

function escapeXml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
