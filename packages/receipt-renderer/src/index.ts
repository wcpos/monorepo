import Mustache from 'mustache';

import { parseXml } from './parse-xml';
import { analyzeThermalAst, renderEscpos } from './render-escpos';
import { renderBarcode, renderHtml, renderQrCode } from './render-html';
import { sanitizeHtml } from './sanitize-html';

import type { EscposRenderOptions, ThermalLayoutDiagnostics } from './render-escpos';
import type { SanitizeHtmlOptions } from './sanitize-html';

export { parseXml } from './parse-xml';
export { renderHtml } from './render-html';
export { renderEscpos, thermalBarcodeImageKey, thermalImageAssetKey } from './render-escpos';
export { sanitizeHtml } from './sanitize-html';
export type { HtmlRenderOptions } from './render-html';
export type {
	EscposRenderOptions,
	ThermalLayoutDiagnostics,
	ThermalRowDiagnostic,
} from './render-escpos';
export type { SanitizeHtmlOptions } from './sanitize-html';
export type * from './types';

export function renderReceiptTemplate(template: string, data: Record<string, any>): string {
	return Mustache.render(template, data);
}

/**
 * Sanitize options shared by every pipeline that emits barcode SVG: thermal
 * preview and logicless HTML. Both call `renderBarcode` / `renderQrCode`,
 * which produce `<svg><path/></svg>` wrapped in a `data-barcode-*` div, so
 * the allow-list permits those tags and attributes.
 */
export const thermalPreviewSanitizeOptions = {
	addTags: ['svg', 'path'],
	addAttributes: [
		'viewBox',
		'xmlns',
		'd',
		'fill',
		'fill-rule',
		'stroke',
		'stroke-width',
		'data-barcode-kind',
		'data-barcode-value',
	],
} satisfies SanitizeHtmlOptions;

export function sanitizeThermalPreviewHtml(
	html: string,
	options: SanitizeHtmlOptions = {}
): string {
	return sanitizeHtml(html, {
		...options,
		addTags: [...thermalPreviewSanitizeOptions.addTags, ...(options.addTags ?? [])],
		addAttributes: [
			...thermalPreviewSanitizeOptions.addAttributes,
			...(options.addAttributes ?? []),
		],
	});
}

export interface RenderSanitizeOptions extends SanitizeHtmlOptions {
	/** Disable sanitization only for trusted test/debug output. Defaults to true. */
	sanitize?: boolean;
}

export type LogiclessRenderOptions = RenderSanitizeOptions;
export type ThermalPreviewOptions = RenderSanitizeOptions;

/**
 * Render a logicless HTML template with Mustache data, then resolve any
 * `<barcode>` / `<qrcode>` elements to inline barcode SVG (mirroring the
 * thermal pipeline's `renderHtml` behavior), then sanitize.
 *
 * Logicless templates can use the same syntax thermal templates use:
 *
 *     <barcode type="code128" height="40">{{order.number}}</barcode>
 *     <qrcode size="4">{{fiscal.qr_payload}}</qrcode>
 */
export function renderLogiclessTemplate(
	template: string,
	data: Record<string, any>,
	options: LogiclessRenderOptions = {}
): string {
	const rendered = Mustache.render(template, data);
	const withBarcodes = resolveBarcodeElements(rendered);
	if (options.sanitize === false) return withBarcodes;
	return sanitizeHtml(withBarcodes, {
		...options,
		addTags: [...thermalPreviewSanitizeOptions.addTags, ...(options.addTags ?? [])],
		addAttributes: [
			...thermalPreviewSanitizeOptions.addAttributes,
			...(options.addAttributes ?? []),
		],
	});
}

/**
 * Walk rendered HTML and replace any `<barcode>` / `<qrcode>` elements with
 * the SVG output produced by `renderBarcode` / `renderQrCode`. No-op when
 * the markup contains no barcode elements, or when no DOMParser is
 * available (e.g. server-side build tooling without a DOM polyfill).
 */
function resolveBarcodeElements(html: string): string {
	if (!/<barcode\b|<qrcode\b/i.test(html)) return html;
	if (typeof DOMParser === 'undefined') return html;

	const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');

	for (const el of Array.from(doc.querySelectorAll('barcode'))) {
		const type = el.getAttribute('type') ?? 'code128';
		const heightAttr = el.getAttribute('height');
		const height = heightAttr ? Number(heightAttr) : 40;
		const value = (el.textContent ?? '').trim();
		replaceElementWithHtml(
			el,
			isQrBarcodeType(type)
				? renderQrCode(value, heightToQrSize(height))
				: renderBarcode(type, value, height, 'barcode'),
			doc
		);
	}

	for (const el of Array.from(doc.querySelectorAll('qrcode'))) {
		const sizeAttr = el.getAttribute('size');
		const size = sizeAttr ? Number(sizeAttr) : 4;
		const value = (el.textContent ?? '').trim();
		replaceElementWithHtml(el, renderQrCode(value, size), doc);
	}

	return doc.body.innerHTML;
}

function isQrBarcodeType(type: string): boolean {
	return type.trim().toLowerCase() === 'qrcode' || type.trim().toLowerCase() === 'qr';
}

function heightToQrSize(height: number): number {
	return Number.isFinite(height) && height > 0
		? Math.max(2, Math.min(10, Math.round(height / 10)))
		: 4;
}

function replaceElementWithHtml(el: Element, html: string, doc: Document): void {
	const tmp = doc.createElement('div');
	tmp.innerHTML = html;
	const fragment = doc.createDocumentFragment();
	while (tmp.firstChild) fragment.appendChild(tmp.firstChild);
	el.replaceWith(fragment);
}

/**
 * Render a thermal XML template to sanitized HTML preview.
 * Pipeline: Mustache data binding -> XML parse -> AST -> HTML -> sanitize
 */
export function renderThermalPreview(
	template: string,
	data: Record<string, any>,
	options: ThermalPreviewOptions = {}
): string {
	const resolved = Mustache.render(template, data);
	const ast = parseXml(resolved);
	const html = renderHtml(ast);
	return options.sanitize === false ? html : sanitizeThermalPreviewHtml(html, options);
}

/**
 * Encode a thermal XML template to ESC/POS bytes.
 * Pipeline: Mustache data binding -> XML parse -> AST -> Uint8Array
 */
export function encodeThermalTemplate(
	template: string,
	data: Record<string, any>,
	options?: EscposRenderOptions
): Uint8Array {
	const resolved = Mustache.render(template, data);
	const ast = parseXml(resolved);
	return renderEscpos(ast, options);
}

export function analyzeThermalTemplate(
	template: string,
	data: Record<string, any>,
	options: EscposRenderOptions = {}
): ThermalLayoutDiagnostics {
	const resolved = Mustache.render(template, data);
	const ast = parseXml(resolved);
	return analyzeThermalAst(ast, options.columns ?? ast.paperWidth);
}
