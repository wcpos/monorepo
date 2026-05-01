/**
 * Pipeline-parity render helper.
 *
 * Runs the canonical chain (`mapReceiptData → formatReceiptData → render*`)
 * for a single (template, data, settings) tuple. This is the same chain that
 * gallery templates go through in production, exposed as a single entry point
 * so the Template Studio renders identically to consumers.
 */

import {
	encodeThermalTemplate,
	renderLogiclessTemplate,
	renderThermalPreview,
} from '@wcpos/receipt-renderer';
import type { EscposRenderOptions } from '@wcpos/receipt-renderer';

import { formatReceiptData } from './format-receipt-data';
import { mapReceiptData } from './map-receipt-data';

import type { ReceiptData } from './types';

export type StudioTemplateEngine = 'logicless' | 'thermal';

export interface RenderForStudioOptions {
	/** Template body (HTML for logicless, XML for thermal). */
	template: string;
	/** Engine the template was authored against. */
	engine: StudioTemplateEngine;
	/** Canonical (or close-to-canonical) ReceiptData. Pre-canonical inputs are normalized via mapReceiptData. */
	data: unknown;
	/** ESC/POS encoder options. Only used for the thermal engine. */
	encodeOptions?: EscposRenderOptions;
	/**
	 * Whether to sanitize the rendered HTML.
	 *
	 * Default `true`. Pass `false` only for trusted snapshot/debug paths
	 * (matches the public render functions). The Studio uses `false` when
	 * running pipeline-parity comparisons against production output that does
	 * not sanitize.
	 */
	sanitize?: boolean;
}

export type RenderForStudioResult =
	| {
			engine: 'logicless';
			html: string;
			data: Record<string, any>;
	  }
	| {
			engine: 'thermal';
			html: string;
			bytes: Uint8Array;
			data: Record<string, any>;
	  };

/**
 * Apply the production pipeline `mapReceiptData → formatReceiptData` to the
 * supplied data and return the formatted object that templates render against.
 *
 * Useful for snapshot tests or anywhere the formatted data needs inspection
 * without rendering a template.
 */
export function buildTemplateData(data: unknown): Record<string, any> {
	const canonical: ReceiptData = mapReceiptData((data ?? {}) as Record<string, unknown>);
	return formatReceiptData(canonical);
}

/**
 * Single-call render helper. Runs the full pipeline and returns both the
 * formatted template data (for diagnostics / parity checks) and the rendered
 * output (HTML for both engines, plus ESC/POS bytes for thermal).
 */
export function renderForStudio(options: RenderForStudioOptions): RenderForStudioResult {
	const { template, engine, encodeOptions, sanitize = true } = options;
	const formatted = buildTemplateData(options.data);

	if (engine === 'logicless') {
		const html = renderLogiclessTemplate(template, formatted, { sanitize });
		return { engine: 'logicless', html, data: formatted };
	}

	const html = renderThermalPreview(template, formatted, { sanitize });
	const bytes = encodeThermalTemplate(template, formatted, encodeOptions);
	return { engine: 'thermal', html, bytes, data: formatted };
}
