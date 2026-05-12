import { renderForStudio } from '@wcpos/printer/encoder';
import type { EscposRenderOptions } from '@wcpos/receipt-renderer';

import { debugInfo, debugLog } from './lib/debug-log';

export type TemplateEngine = 'logicless' | 'thermal';
export type TemplateSource = 'bundled-gallery' | 'wp-env';
export type PaperWidth = '58mm' | '80mm' | 'a4';
export type ThermalColumns = 32 | 42 | 48;
export type ThermalPaperWidth = Extract<PaperWidth, '58mm' | '80mm'>;

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
	thermalColumns?: ThermalColumns;
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
	debugInfo('studio-core', 'renderStudioTemplate started', {
		templateId: template.id,
		templateName: template.name,
		engine: template.engine,
		fixtureId: fixture.id,
		paperWidth,
		templatePaperWidth: template.paperWidth,
		thermalColumns: input.thermalColumns,
		printerModel,
		language,
		hasEncodeOptions: Boolean(encodeOptions),
		fullReceiptRaster: Boolean(encodeOptions?.fullReceiptRasterImage),
		imageAssetCount: encodeOptions?.imageAssets
			? Object.keys(encodeOptions.imageAssets).length
			: undefined,
		barcodeImageCount: encodeOptions?.barcodeImages
			? Object.keys(encodeOptions.barcodeImages).length
			: undefined,
	});

	if (template.engine === 'logicless') {
		const result = renderForStudio({
			template: template.content,
			engine: 'logicless',
			data: fixture,
		});
		debugInfo('studio-core', 'renderStudioTemplate completed logicless render', {
			templateId: template.id,
			htmlLength: result.html.length,
			hasDiagnosticHtml: Boolean(template.previewHtml),
		});
		return {
			kind: 'logicless',
			html: result.html,
			diagnosticHtml: template.previewHtml,
			data: result.data,
		};
	}

	const resolvedPaperWidth = template.paperWidth ?? paperWidth;
	if (resolvedPaperWidth !== '58mm' && resolvedPaperWidth !== '80mm') {
		throw new Error(
			`Thermal templates require a thermal paper width, received "${resolvedPaperWidth}"`
		);
	}
	const thermalPaperWidth: ThermalPaperWidth = resolvedPaperWidth;
	const columns = normalizeThermalColumns(
		input.thermalColumns,
		defaultThermalColumnsForPaper(thermalPaperWidth)
	);
	const mergedEncodeOptions: EscposRenderOptions = {
		...encodeOptions,
		columns,
	};
	if (printerModel) mergedEncodeOptions.printerModel = printerModel;
	if (language) mergedEncodeOptions.language = language;
	if ((mergedEncodeOptions.language ?? 'esc-pos') === 'esc-pos') {
		// Template Studio intentionally forces CP932 for ESC/POS previews/prints, even if
		// callers pass `enableCp932: false` through `mergedEncodeOptions`.
		mergedEncodeOptions.enableCp932 = true;
	}
	debugLog('studio-core', 'thermal encode options resolved', {
		templateId: template.id,
		thermalPaperWidth,
		columns,
		printerModel: mergedEncodeOptions.printerModel,
		language: mergedEncodeOptions.language,
		enableCp932: mergedEncodeOptions.enableCp932,
		emitEscPrintMode: mergedEncodeOptions.emitEscPrintMode,
		imageMode: mergedEncodeOptions.imageMode,
		imageAlgorithm: mergedEncodeOptions.imageAlgorithm,
		imageThreshold: mergedEncodeOptions.imageThreshold,
		barcodeMode: mergedEncodeOptions.barcodeMode,
		hasFullReceiptRasterImage: Boolean(mergedEncodeOptions.fullReceiptRasterImage),
	});
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
	debugInfo('studio-core', 'renderStudioTemplate completed thermal render', {
		templateId: template.id,
		htmlLength: result.html.length,
		byteLength: result.bytes.byteLength,
		base64Length: bytesToBase64(result.bytes).length,
		hexLength: debug.hex.length,
		asciiLength: debug.ascii.length,
	});
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

export function defaultThermalColumnsForPaper(paperWidth: ThermalPaperWidth): ThermalColumns {
	return paperWidth === '58mm' ? 32 : 42;
}

export function normalizeThermalColumns(value: unknown, fallback: ThermalColumns): ThermalColumns {
	return value === 32 || value === 42 || value === 48 ? value : fallback;
}

/** @deprecated Paper width is physical, not printer CPL. Use explicit thermal columns. */
export function paperWidthToColumns(paperWidth: PaperWidth | string | null | undefined): number {
	if (paperWidth === '58mm') return 32;
	if (paperWidth === '80mm') return 48;
	return 80;
}
