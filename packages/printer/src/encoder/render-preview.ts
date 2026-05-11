import {
	renderLogiclessTemplate,
	renderThermalPreview,
} from '@wcpos/receipt-renderer/render-template';

import { formatReceiptData } from './format-receipt-data';
import { mapReceiptData } from './map-receipt-data';

import type { ReceiptData } from './types';

export type PreviewTemplateEngine = 'logicless' | 'thermal';

export interface RenderPreviewOptions {
	/** Template body (HTML for logicless, XML for thermal). */
	template: string;
	/** Engine the template was authored against. */
	engine: PreviewTemplateEngine;
	/** Canonical (or close-to-canonical) ReceiptData. Pre-canonical inputs are normalized via mapReceiptData. */
	data: unknown;
	/** Whether to sanitize the rendered HTML. Default true. */
	sanitize?: boolean;
}

export interface RenderPreviewResult {
	engine: PreviewTemplateEngine;
	html: string;
	data: Record<string, any>;
}

export function buildPreviewTemplateData(data: unknown): Record<string, any> {
	const canonical: ReceiptData = mapReceiptData((data ?? {}) as Record<string, unknown>);
	return formatReceiptData(canonical);
}

export function renderPreview(options: RenderPreviewOptions): RenderPreviewResult {
	const { template, engine, sanitize = true } = options;
	const formatted = buildPreviewTemplateData(options.data);
	const html =
		engine === 'thermal'
			? renderThermalPreview(template, formatted, { sanitize })
			: renderLogiclessTemplate(template, formatted, { sanitize });

	return { engine, html, data: formatted };
}
