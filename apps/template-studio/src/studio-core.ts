import {
	encodeThermalTemplate,
	renderLogiclessTemplate,
	renderThermalPreview,
} from '@wcpos/receipt-renderer';

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
}

export type StudioRenderResult =
	| {
			kind: 'logicless';
			html: string;
			diagnosticHtml?: string;
	  }
	| {
			kind: 'thermal';
			html: string;
			escposHex: string;
			escposAscii: string;
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

export function renderStudioTemplate(input: RenderStudioTemplateInput): StudioRenderResult {
	if (input.template.engine === 'logicless') {
		return {
			kind: 'logicless',
			html: renderLogiclessTemplate(input.template.content, input.fixture),
			diagnosticHtml: input.template.previewHtml,
		};
	}

	const columns = paperWidthToColumns(input.template.paperWidth ?? input.paperWidth);
	const bytes = encodeThermalTemplate(input.template.content, input.fixture, { columns });
	const debug = bytesToDebugOutput(bytes);

	return {
		kind: 'thermal',
		html: renderThermalPreview(input.template.content, input.fixture),
		escposHex: debug.hex,
		escposAscii: debug.ascii,
	};
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
