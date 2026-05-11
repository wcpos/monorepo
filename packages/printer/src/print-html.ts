export type ReceiptPaperWidth = '58mm' | '80mm' | 'a4';

interface BuildPrintableReceiptHtmlOptions {
	bodyHtml: string;
	paperWidth?: string | null;
}

export function normalizeReceiptPaperWidth(value: string | null | undefined): ReceiptPaperWidth {
	const normalized = value?.trim().toLowerCase();
	if (normalized === '58mm' || normalized === '80mm' || normalized === 'a4') {
		return normalized;
	}
	return 'a4';
}

export function buildPrintableReceiptHtml({
	bodyHtml,
	paperWidth,
}: BuildPrintableReceiptHtmlOptions): string {
	const normalizedPaperWidth = normalizeReceiptPaperWidth(paperWidth);
	const pageSize = normalizedPaperWidth === 'a4' ? 'A4' : normalizedPaperWidth;
	const widthRule = normalizedPaperWidth === 'a4' ? '\nbody > * { width: 210mm; }' : '';

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>WCPOS Receipt</title>
<style>
@page { size: ${pageSize}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { display: flex; justify-content: center; color: #000; }
* { box-sizing: border-box; }
body, body * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }${widthRule}
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

export function prepareSystemPrintHtml({
	html,
	paperWidth,
}: {
	html: string;
	paperWidth?: string | null;
}): string {
	return buildPrintableReceiptHtml({
		bodyHtml: extractPrintableBodyHtml(html),
		paperWidth,
	});
}

function extractPrintableBodyHtml(html: string): string {
	const trimmed = html.trimStart().toLowerCase();
	const looksLikeFullDocument = trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
	if (!looksLikeFullDocument) return html;
	if (typeof DOMParser === 'undefined') return extractFullDocumentHtmlWithoutDomParser(html);

	const doc = new DOMParser().parseFromString(html, 'text/html');
	const headPrintAssets = Array.from(
		doc.head.querySelectorAll('base, style, link[rel~="stylesheet" i]')
	)
		.map((element) => element.outerHTML)
		.join('');
	return `${headPrintAssets}${doc.body.innerHTML}`;
}

function extractFullDocumentHtmlWithoutDomParser(html: string): string {
	const headHtml = extractElementInnerHtml(html, 'head') ?? '';
	const bodyHtml = extractElementInnerHtml(html, 'body') ?? stripLeadingDoctype(html);
	const headPrintAssets = Array.from(
		headHtml.matchAll(
			/<(?:base\b[^>]*>|style\b[\s\S]*?<\/style>|link\b(?=[^>]*\brel=["'][^"']*stylesheet)[^>]*>)/gi
		),
		(match) => match[0]
	).join('');

	return `${headPrintAssets}${bodyHtml}`;
}

function extractElementInnerHtml(html: string, tagName: 'head' | 'body'): string | null {
	const lowerHtml = html.toLowerCase();
	const openStart = lowerHtml.indexOf(`<${tagName}`);
	if (openStart === -1) return null;

	const openEnd = html.indexOf('>', openStart + tagName.length + 1);
	if (openEnd === -1) return null;

	const closeStart = lowerHtml.indexOf(`</${tagName}>`, openEnd + 1);
	if (closeStart === -1) return null;

	return html.slice(openEnd + 1, closeStart);
}

function stripLeadingDoctype(html: string): string {
	let start = 0;
	while (start < html.length && isHtmlWhitespace(html[start])) start += 1;

	if (!html.toLowerCase().startsWith('<!doctype', start)) return html;

	const doctypeEnd = html.indexOf('>', start + 9);
	return doctypeEnd === -1 ? html : html.slice(doctypeEnd + 1);
}

function isHtmlWhitespace(character: string): boolean {
	return character === ' ' || character === '\n' || character === '\t' || character === '\r';
}
