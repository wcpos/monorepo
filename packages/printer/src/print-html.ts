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
	const pageSize = normalizedPaperWidth === 'a4' ? 'A4' : `${normalizedPaperWidth} auto`;
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
	const headPrintAssets = Array.from(doc.head.querySelectorAll('style, link[rel~="stylesheet" i]'))
		.map((element) => element.outerHTML)
		.join('');
	return `${headPrintAssets}${doc.body.innerHTML}`;
}

function extractFullDocumentHtmlWithoutDomParser(html: string): string {
	const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
	const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	const headHtml = headMatch?.[1] ?? '';
	const bodyHtml = bodyMatch?.[1] ?? html.replace(/^\s*<!doctype[^>]*>/i, '');
	const headPrintAssets = Array.from(
		headHtml.matchAll(
			/<(?:style\b[\s\S]*?<\/style>|link\b(?=[^>]*\brel=["'][^"']*stylesheet)[^>]*>)/gi
		),
		(match) => match[0]
	).join('');

	return `${headPrintAssets}${bodyHtml}`;
}
