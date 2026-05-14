import { toSVG } from 'bwip-js/browser';

import type { ColNode, ReceiptNode, RowNode, ThermalNode } from './types.js';

export type HtmlRenderOptions = object;

// 80mm thermal paper at 203 DPI prints ~576 dots wide; 58mm prints ~384 dots.
// We pick a budget from the receipt's character width because that is what the
// AST gives us — anything ≥ 40 chars is treated as 80mm.
const DOT_BUDGET_WIDE = 576;
const DOT_BUDGET_NARROW = 384;
const NARROW_PAPER_THRESHOLD_CHARS = 40;
const BARCODE_PREVIEW_SCALE = 1.5;

export function renderHtml(ast: ReceiptNode, _options: HtmlRenderOptions = {}): string {
	const widthChars = safeInteger(ast.paperWidth, 48, 16, 120);
	const inner = renderNodes(ast.children, widthChars);
	return `<div style="width: ${widthChars}ch; font-family: 'Courier New', Courier, monospace; font-size: 13px; line-height: 1.4; background: #fff; color: #000; padding: 16px 12px; overflow: hidden; white-space: pre-wrap; word-break: break-all;">${inner}</div>`;
}

function renderNodes(nodes: ThermalNode[], widthChars: number): string {
	return nodes.map((node) => renderNode(node, widthChars)).join('');
}

function renderNode(node: ThermalNode, widthChars: number): string {
	switch (node.type) {
		case 'raw-text':
			return escapeHtml(node.value);
		case 'text':
			return `<div>${renderNodes(node.children, widthChars)}</div>`;
		case 'bold':
			return `<strong>${renderNodes(node.children, widthChars)}</strong>`;
		case 'underline':
			return `<span style="text-decoration: underline">${renderNodes(node.children, widthChars)}</span>`;
		case 'invert':
			return `<span style="background: #000; color: #fff; padding: 0 4px">${renderNodes(node.children, widthChars)}</span>`;
		case 'size':
			return `<span style="font-size: ${safeFloat(node.width, 1, 0.5, 8)}em; line-height: 1.2">${renderNodes(node.children, widthChars)}</span>`;
		case 'align':
			return `<div style="text-align: ${safeAlign(node.mode)}">${renderNodes(node.children, widthChars)}</div>`;
		case 'row':
			return renderRow(node, widthChars);
		case 'col':
			return renderCol(node, widthChars);
		case 'line':
			if (node.style === 'double') {
				return '<hr style="border: none; border-top: 3px double #000; margin: 4px 0" />';
			}
			if (node.style === 'dashed') {
				return '<hr style="border: none; border-top: 1px dashed #000; margin: 4px 0" />';
			}
			if (node.style === 'dotted') {
				return '<hr style="border: none; border-top: 1px dotted #000; margin: 4px 0" />';
			}
			return '<hr style="border: none; border-top: 1px solid #000; margin: 4px 0" />';
		case 'barcode':
			if (isQrBarcodeType(node.barcodeType)) {
				return renderQrCode(node.value, heightToQrSize(node.height), widthChars);
			}
			return renderBarcode(node.barcodeType, node.value, node.height, 'barcode', widthChars);
		case 'qrcode':
			return renderQrCode(node.value, node.size, widthChars);
		case 'image': {
			const safeSrc = safeImageSrc(node.src);
			if (!safeSrc) return '';
			const widthDots = safeInteger(node.width, 200, 1, 2000);
			const widthCh = dotsToCh(widthDots, widthChars);
			return `<div style="text-align: center; padding: 8px 0"><img src="${safeSrc}" style="width: min(100%, ${widthCh.toFixed(2)}ch); height: auto" /></div>`;
		}
		case 'cut':
			return '<div style="border-top: 1px dashed #ccc; margin: 12px 0; position: relative"><span style="position: absolute; top: -8px; left: -4px; font-size: 14px">&#9986;</span></div>';
		case 'feed':
			return `<div style="height: ${safeInteger(node.lines, 1, 1, 50) * 1.4}em"></div>`;
		case 'drawer':
			return '';
		case 'receipt':
			return renderNodes(node.children, widthChars);
		default:
			return '';
	}
}

export function renderBarcode(
	barcodeType: string,
	value: string,
	height: number,
	kind: 'barcode' | 'qrcode',
	paperWidthChars?: number
): string {
	const text = value.trim();
	if (!text) return '';

	try {
		const svg = toSVG({
			bcid: barcodeType.toLowerCase(),
			text,
			height: safeInteger(height, 40, 1, 600) / 10,
			scale: 2,
			includetext: kind === 'barcode',
			textsize: 10,
		});

		return `<div data-barcode-kind="${kind}" data-barcode-value="${escapeHtml(text)}" style="text-align: center; padding: 8px 0">${constrainSvg(svg, paperWidthChars, kind)}</div>`;
	} catch (error) {
		return renderBarcodeError(kind, barcodeType, text, error);
	}
}

export function renderQrCode(value: string, size: number, paperWidthChars?: number): string {
	const text = value.trim();
	if (!text) return '';

	try {
		const svg = toSVG({
			bcid: 'qrcode',
			text,
			scale: safeInteger(size, 4, 1, 20),
		});

		return `<div data-barcode-kind="qrcode" data-barcode-value="${escapeHtml(text)}" style="text-align: center; padding: 8px 0">${constrainSvg(svg, paperWidthChars, 'qrcode')}</div>`;
	} catch (error) {
		return renderBarcodeError('qrcode', 'qrcode', text, error);
	}
}

function renderBarcodeError(
	kind: 'barcode' | 'qrcode',
	barcodeType: string,
	text: string,
	error: unknown
): string {
	const title = kind === 'qrcode' ? 'QR code error' : 'Barcode error';
	const normalizedType = barcodeType.trim().toLowerCase() || kind;
	const summary =
		kind === 'qrcode' ? 'Invalid QR code value' : `Invalid ${normalizedType} barcode value`;
	const detail = error instanceof Error && error.message.trim() ? error.message.trim() : '';
	const detailHtml = detail ? `<div style="font-size: 0.9em">${escapeHtml(detail)}</div>` : '';

	return `<div data-barcode-kind="${kind}" data-barcode-value="${escapeHtml(text)}" data-barcode-error="true" style="text-align: center; padding: 8px 0; color: #b91c1c"><strong>${title}</strong><div>${escapeHtml(summary)}</div>${detailHtml}<code>${escapeHtml(text)}</code></div>`;
}

function renderRow(node: RowNode, widthChars: number): string {
	const cols = node.children.map((col) => renderCol(col, widthChars)).join('');
	return `<div style="display: flex">${cols}</div>`;
}

function renderCol(node: ColNode, widthChars: number): string {
	const flex =
		node.width === '*' ? 'flex: 1' : `flex: 0 0 ${safeInteger(node.width, 12, 1, 120)}ch`;
	return `<span style="${flex}; text-align: ${safeAlign(node.align)}; overflow: hidden">${renderNodes(node.children, widthChars)}</span>`;
}

function safeInteger(value: unknown, fallback: number, min: number, max: number): number {
	const n = Math.trunc(Number(value));
	return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function safeFloat(value: unknown, fallback: number, min: number, max: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function safeAlign(value: unknown): 'left' | 'center' | 'right' {
	return value === 'left' || value === 'center' || value === 'right' ? value : 'left';
}

function isQrBarcodeType(type: string): boolean {
	const normalized = type.trim().toLowerCase();
	return normalized === 'qrcode' || normalized === 'qr';
}

function heightToQrSize(height: number): number {
	return Number.isFinite(height) && height > 0
		? Math.max(2, Math.min(10, Math.round(height / 10)))
		: 4;
}

/**
 * Convert printer dots to ch units relative to the receipt's character width.
 *
 * The bwip-js SVG uses 1 SVG unit per printer dot (at scale=2 each barcode
 * module is 2 dots wide), and the thermal encoder rasterises images at their
 * dot-equivalent width. Sizing previews against the dot budget keeps the
 * relative width of images and barcodes consistent between the studio
 * preview and the printed receipt.
 */
function dotsToCh(dots: number, paperWidthChars: number): number {
	const dotBudget =
		paperWidthChars >= NARROW_PAPER_THRESHOLD_CHARS ? DOT_BUDGET_WIDE : DOT_BUDGET_NARROW;
	return (dots * paperWidthChars) / dotBudget;
}

function svgIntrinsicWidth(svg: string): number | null {
	const widthMatch = svg.match(/<svg\b[^>]*?\bwidth\s*=\s*["']?([0-9.]+)/);
	if (widthMatch) return Number(widthMatch[1]);
	const viewBoxMatch = svg.match(
		/<svg\b[^>]*?\bviewBox\s*=\s*["']\s*[0-9.]+\s+[0-9.]+\s+([0-9.]+)/
	);
	if (viewBoxMatch) return Number(viewBoxMatch[1]);
	return null;
}

function constrainSvg(
	svg: string,
	paperWidthChars?: number,
	kind: 'barcode' | 'qrcode' = 'barcode'
): string {
	if (paperWidthChars === undefined) {
		return svg.replace('<svg ', '<svg style="max-width: 100%; height: auto" ');
	}
	const naturalWidth = svgIntrinsicWidth(svg);
	if (naturalWidth === null || naturalWidth <= 0) {
		return svg.replace('<svg ', '<svg style="max-width: 100%; height: auto" ');
	}
	const widthCh =
		dotsToCh(naturalWidth, paperWidthChars) * (kind === 'barcode' ? BARCODE_PREVIEW_SCALE : 1);
	return svg.replace(
		'<svg ',
		`<svg style="width: min(100%, ${widthCh.toFixed(2)}ch); height: auto" `
	);
}

function safeImageSrc(src: unknown): string {
	if (typeof src !== 'string') return '';
	const value = src.trim();
	const isHttpUrl = /^https?:\/\//i.test(value);
	const isSafeDataUri = /^data:image\/(?:png|jpe?g|gif);base64,[A-Za-z0-9+/=]+$/i.test(value);
	const isSafeRootRelative = isSafeRootRelativeImageSrc(value);
	return isHttpUrl || isSafeDataUri || isSafeRootRelative ? escapeHtml(value) : '';
}

function isSafeRootRelativeImageSrc(value: string): boolean {
	if (value.startsWith('//')) return false;
	if (value.includes('\\')) return false;
	const path = value.split(/[?#]/, 1)[0];
	const suffix = value.slice(path.length);
	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(path);
	} catch {
		return false;
	}
	if (decodedPath.includes('\\')) return false;
	const segments = decodedPath.split('/');
	if (segments.includes('..') || segments.includes('.')) return false;
	return (
		/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(path) &&
		(suffix === '' || /^[?#][A-Za-z0-9._~!$&'()*+,;=:@%/?#-]+$/.test(suffix))
	);
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
