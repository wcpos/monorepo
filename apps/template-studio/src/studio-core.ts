import { renderForStudio } from '@wcpos/printer/encoder';
import type { EscposRenderOptions } from '@wcpos/receipt-renderer';

export type TemplateEngine = 'logicless' | 'thermal';
export type TemplateSource = 'bundled-gallery' | 'wp-env';
export type PaperWidth = '58mm' | '80mm' | 'a4';

export interface StudioTemplate {
	id: string;
	name: string;
	engine: TemplateEngine;
	source: TemplateSource;
	content: string;
	description?: string;
	paperWidth?: PaperWidth | null;
	previewHtml?: string;
}

export interface ReceiptFixture {
	id: string;
	[key: string]: unknown;
}

export interface RenderStudioTemplateInput {
	template: StudioTemplate;
	fixture: ReceiptFixture;
	paperWidth: PaperWidth;
	/** Optional thermal encoder overrides surfaced through the WooCommerce panel. */
	printerModel?: string;
	language?: 'esc-pos' | 'star-prnt' | 'star-line';
	encodeOptions?: EscposRenderOptions;
}

export type StudioRenderResult =
	| {
			kind: 'logicless';
			html: string;
			diagnosticHtml?: string;
			data: Record<string, any>;
	  }
	| {
			kind: 'thermal';
			html: string;
			escposBytes: Uint8Array;
			escposBase64: string;
			escposHex: string;
			escposAscii: string;
			data: Record<string, any>;
	  };

export interface StudioSnapshotViewModel {
	templateId: string;
	fixtureId: string;
	engine: TemplateEngine;
	paperWidth: PaperWidth;
	html: string;
	escposHex?: string;
}

export function selectVisibleTemplate(
	visibleTemplates: readonly StudioTemplate[],
	selectedTemplateId: string
): StudioTemplate | undefined {
	return (
		visibleTemplates.find((template) => template.id === selectedTemplateId) ?? visibleTemplates[0]
	);
}

/**
 * Render a Studio template through the canonical pipeline:
 * `mapReceiptData → formatReceiptData → renderLogiclessTemplate / renderThermalPreview / encodeThermalTemplate`.
 *
 * Sanitization is on (default) for both engines, matching production.
 */
export function renderStudioTemplate(input: RenderStudioTemplateInput): StudioRenderResult {
	const { template, fixture, paperWidth, printerModel, language, encodeOptions } = input;

	if (template.engine === 'logicless') {
		const result = renderForStudio({
			template: template.content,
			engine: 'logicless',
			data: fixture,
		});
		return {
			kind: 'logicless',
			html: result.html,
			diagnosticHtml: template.previewHtml,
			data: result.data,
		};
	}

	const columns = paperWidthToColumns(template.paperWidth ?? paperWidth);
	const mergedEncodeOptions: EscposRenderOptions = {
		...encodeOptions,
		printerModel: printerModel || encodeOptions?.printerModel,
		language: language ?? encodeOptions?.language,
		columns,
	};
	if ((mergedEncodeOptions.language ?? 'esc-pos') === 'esc-pos') {
		// Template Studio intentionally forces CP932 for ESC/POS previews/prints, even if
		// callers pass `enableCp932: false` through `mergedEncodeOptions`.
		mergedEncodeOptions.enableCp932 = true;
	}
	const result = renderForStudio({
		template: template.content,
		engine: 'thermal',
		data: fixture,
		encodeOptions: mergedEncodeOptions,
	});

	if (result.engine !== 'thermal') {
		throw new Error('renderForStudio returned unexpected engine for thermal template');
	}

	const debug = bytesToDebugOutput(result.bytes);
	return {
		kind: 'thermal',
		html: result.html,
		escposBytes: result.bytes,
		escposBase64: bytesToBase64(result.bytes),
		escposHex: debug.hex,
		escposAscii: debug.ascii,
		data: result.data,
	};
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export function buildTemplateViewModel(input: RenderStudioTemplateInput): StudioSnapshotViewModel {
	const resolvedPaperWidth = input.template.paperWidth ?? input.paperWidth;
	const rendered = renderStudioTemplate(input);
	return {
		templateId: input.template.id,
		fixtureId: input.fixture.id,
		engine: input.template.engine,
		paperWidth: resolvedPaperWidth,
		html: rendered.html,
		escposHex: rendered.kind === 'thermal' ? rendered.escposHex : undefined,
	};
}

export function bytesToDebugOutput(bytes: Uint8Array): { hex: string; ascii: string } {
	return {
		hex: Array.from(bytes)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join(' '),
		ascii: Array.from(bytes)
			.map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'))
			.join(''),
	};
}

export function paperWidthToColumns(paperWidth: PaperWidth | string | null | undefined): number {
	if (paperWidth === '58mm') return 32;
	if (paperWidth === '80mm') return 48;
	return 80;
}
