import Mustache from 'mustache';

import { parseXml } from './parse-xml';
import { renderEposXml } from './render-epos-xml';
import { analyzeThermalAst, renderEscpos } from './render-escpos';

import type { EposRenderOptions } from './render-epos-xml';
import type { EscposRenderOptions, ThermalLayoutDiagnostics } from './render-escpos';

export { parseXml } from './parse-xml';
export { renderBarcode, renderHtml, renderQrCode } from './render-html';
export { renderEposXml, thermalRasterToBase64 } from './render-epos-xml';
export {
	extractText,
	formatRow,
	formatThermalTableCell,
	normalizeThermalText,
	renderEscpos,
	resolveThermalRowWidths,
	thermalBarcodeImageKey,
	thermalImageAssetKey,
} from './render-escpos';
export { sanitizeHtml } from './sanitize-html';
export type { HtmlRenderOptions } from './render-html';
export type { EposRenderOptions } from './render-epos-xml';
export type {
	EscposRenderOptions,
	ThermalLayoutDiagnostics,
	ThermalRowDiagnostic,
} from './render-escpos';
export type { SanitizeHtmlOptions } from './sanitize-html';
export type * from './types';
export {
	renderLogiclessTemplate,
	renderReceiptTemplate,
	renderThermalPreview,
	sanitizeThermalPreviewHtml,
	thermalPreviewSanitizeOptions,
} from './render-template';
export type {
	LogiclessRenderOptions,
	RenderSanitizeOptions,
	ThermalPreviewOptions,
} from './render-template';

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

/** Encode a thermal XML template to the inner XML of an ePOS-Print body. */
export function encodeThermalTemplateToEpos(
	template: string,
	data: Record<string, any>,
	options?: EposRenderOptions
): string {
	const resolved = Mustache.render(template, data);
	const ast = parseXml(resolved);
	return renderEposXml(ast, options);
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
