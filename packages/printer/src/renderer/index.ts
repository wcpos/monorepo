import Mustache from 'mustache';

import { parseXml } from './parse-xml';
import { renderHtml } from './render-html';
import { renderEscpos } from './render-escpos';

import type { EscposRenderOptions } from './render-escpos';

export { parseXml } from './parse-xml';
export { renderHtml } from './render-html';
export { renderEscpos } from './render-escpos';
export type { EscposRenderOptions } from './render-escpos';

/**
 * Render a thermal XML template to an HTML preview string.
 * Pipeline: Mustache data binding -> XML parse -> AST -> HTML
 */
export function renderThermalPreview(
  template: string,
  data: Record<string, any>,
): string {
  const resolved = Mustache.render(template, data);
  const ast = parseXml(resolved);
  return renderHtml(ast);
}

/**
 * Encode a thermal XML template to ESC/POS bytes.
 * Pipeline: Mustache data binding -> XML parse -> AST -> Uint8Array
 */
export function encodeThermalTemplate(
  template: string,
  data: Record<string, any>,
  options?: EscposRenderOptions,
): Uint8Array {
  const resolved = Mustache.render(template, data);
  const ast = parseXml(resolved);
  return renderEscpos(ast, options);
}
