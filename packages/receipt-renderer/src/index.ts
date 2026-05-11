import Mustache from 'mustache';

import { parseXml } from './parse-xml';
import { analyzeThermalAst, renderEscpos } from './render-escpos';

import type { EscposRenderOptions, ThermalLayoutDiagnostics } from './render-escpos';

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

export function analyzeThermalTemplate(
	template: string,
	data: Record<string, any>,
	options: EscposRenderOptions = {}
): ThermalLayoutDiagnostics {
	const resolved = Mustache.render(template, data);
	const ast = parseXml(resolved);
	return analyzeThermalAst(ast, options.columns ?? ast.paperWidth);
}
