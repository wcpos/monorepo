import Mustache from 'mustache';

import { parseXml } from './parse-xml.js';
import { renderEscpos } from './render-escpos.js';
import { renderHtml } from './render-html.js';
import { sanitizeHtml } from './sanitize-html.js';

import type { EscposRenderOptions } from './render-escpos.js';
import type { SanitizeHtmlOptions } from './sanitize-html.js';

export { parseXml } from './parse-xml.js';
export { renderHtml } from './render-html.js';
export { renderEscpos } from './render-escpos.js';
export { sanitizeHtml } from './sanitize-html.js';
export type { HtmlRenderOptions } from './render-html.js';
export type { EscposRenderOptions } from './render-escpos.js';
export type { SanitizeHtmlOptions } from './sanitize-html.js';
export type * from './types.js';

export interface LogiclessRenderOptions extends SanitizeHtmlOptions {
	/** Disable sanitization only for trusted test/debug output. Defaults to true. */
	sanitize?: boolean;
}

export interface ThermalPreviewOptions extends SanitizeHtmlOptions {
	/** Disable sanitization only for trusted test/debug output. Defaults to true. */
	sanitize?: boolean;
}

/**
 * Render a logicless HTML template with Mustache data, then sanitize the output.
 */
export function renderLogiclessTemplate(
	template: string,
	data: Record<string, any>,
	options: LogiclessRenderOptions = {}
): string {
	const html = Mustache.render(template, data);
	return options.sanitize === false ? html : sanitizeHtml(html, options);
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
	return options.sanitize === false ? html : sanitizeHtml(html, options);
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
