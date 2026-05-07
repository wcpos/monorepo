import { toSVG } from 'bwip-js/browser';

import type { ColNode, ReceiptNode, RowNode, ThermalNode } from './types.js';

export type HtmlRenderOptions = object;

export function renderHtml(ast: ReceiptNode, _options: HtmlRenderOptions = {}): string {
	const width = safeInteger(ast.paperWidth, 48, 16, 120);
	const inner = renderNodes(ast.children);
	return `<div style="width: ${width}ch; font-family: 'Courier New', Courier, monospace; font-size: 13px; line-height: 1.4; background: #fff; color: #000; padding: 16px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); margin: 0 auto; overflow: hidden; white-space: pre-wrap; word-break: break-all;">${inner}</div>`;
}

function renderNodes(nodes: ThermalNode[]): string {
	return nodes.map(renderNode).join('');
}

function renderNode(node: ThermalNode): string {
	switch (node.type) {
		case 'raw-text':
			return escapeHtml(node.value);
		case 'text':
			return `<div>${renderNodes(node.children)}</div>`;
		case 'bold':
			return `<strong>${renderNodes(node.children)}</strong>`;
		case 'underline':
			return `<span style="text-decoration: underline">${renderNodes(node.children)}</span>`;
		case 'invert':
			return `<span style="background: #000; color: #fff; padding: 0 4px">${renderNodes(node.children)}</span>`;
		case 'size':
			return `<span style="font-size: ${safeFloat(node.width, 1, 0.5, 8)}em; line-height: 1.2">${renderNodes(node.children)}</span>`;
		case 'align':
			return `<div style="text-align: ${safeAlign(node.mode)}">${renderNodes(node.children)}</div>`;
		case 'row':
			return renderRow(node);
		case 'col':
			return renderCol(node);
		case 'line':
			if (node.style === 'double') {
				return '<hr style="border: none; border-top: 3px double #000; margin: 4px 0" />';
			}
			return '<hr style="border: none; border-top: 1px dashed #000; margin: 4px 0" />';
		case 'barcode':
			return renderBarcode(node.barcodeType, node.value, node.height, 'barcode');
		case 'qrcode':
			return renderQrCode(node.value, node.size);
		case 'image': {
			const safeSrc = safeImageSrc(node.src);
			if (!safeSrc) return '';
			return `<div style="text-align: center; padding: 8px 0"><img src="${safeSrc}" style="max-width: ${safeInteger(node.width, 200, 1, 2000)}px; height: auto" /></div>`;
		}
		case 'cut':
			return '<div style="border-top: 1px dashed #ccc; margin: 12px 0; position: relative"><span style="position: absolute; top: -8px; left: -4px; font-size: 14px">&#9986;</span></div>';
		case 'feed':
			return `<div style="height: ${safeInteger(node.lines, 1, 1, 50) * 1.4}em"></div>`;
		case 'drawer':
			return '';
		case 'receipt':
			return renderNodes(node.children);
		default:
			return '';
	}
}

export function renderBarcode(
	barcodeType: string,
	value: string,
	height: number,
	kind: 'barcode' | 'qrcode'
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

		return `<div data-barcode-kind="${kind}" data-barcode-value="${escapeHtml(text)}" style="text-align: center; padding: 8px 0">${constrainSvg(svg)}</div>`;
	} catch (error) {
		return renderBarcodeError(kind, barcodeType, text, error);
	}
}

export function renderQrCode(value: string, size: number): string {
	const text = value.trim();
	if (!text) return '';

	try {
		const svg = toSVG({
			bcid: 'qrcode',
			text,
			scale: safeInteger(size, 4, 1, 20),
		});

		return `<div data-barcode-kind="qrcode" data-barcode-value="${escapeHtml(text)}" style="text-align: center; padding: 8px 0">${constrainSvg(svg)}</div>`;
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

function renderRow(node: RowNode): string {
	const cols = node.children.map(renderCol).join('');
	return `<div style="display: flex">${cols}</div>`;
}

function renderCol(node: ColNode): string {
	const flex =
		node.width === '*' ? 'flex: 1' : `flex: 0 0 ${safeInteger(node.width, 12, 1, 120)}ch`;
	return `<span style="${flex}; text-align: ${safeAlign(node.align)}; overflow: hidden">${renderNodes(node.children)}</span>`;
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

function constrainSvg(svg: string): string {
	return svg.replace('<svg ', '<svg style="max-width: 100%; height: auto" ');
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
	if (value.split(/[?#]/, 1)[0].split('/').includes('..')) return false;
	return /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(value);
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
