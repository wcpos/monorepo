/// <reference path="./types/receipt-printer-encoder.d.ts" />
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import iconv from 'iconv-lite';

import type {
	ColNode,
	ReceiptNode,
	ThermalBarcodeImages,
	ThermalBarcodeMode,
	ThermalImageAlgorithm,
	ThermalImageAssets,
	ThermalImageMode,
	ThermalNode,
} from './types.js';

export interface EscposRenderOptions {
	printerModel?: string;
	language?: 'esc-pos' | 'star-prnt' | 'star-line';
	columns?: number;
	enableCp932?: boolean;
	/**
	 * Emit `ESC !` print-mode bytes alongside `GS !` size bytes.
	 *
	 * Default `true`. Some printers and simulators only honour one of the two
	 * size commands; emitting both maximizes compatibility. Disable as an
	 * escape hatch for printers that misbehave when both are sent.
	 */
	emitEscPrintMode?: boolean;
	imageMode?: ThermalImageMode;
	imageAssets?: ThermalImageAssets;
	imageAlgorithm?: ThermalImageAlgorithm;
	imageThreshold?: number;
	barcodeMode?: ThermalBarcodeMode;
	barcodeImages?: ThermalBarcodeImages;
}

interface EscposPrintModeState {
	bold: boolean;
	underline: boolean;
	width: number;
	height: number;
}

interface RenderContext {
	columns: number;
	language: 'esc-pos' | 'star-prnt' | 'star-line';
	align: 'left' | 'center' | 'right';
	lineHasText: boolean;
	supportsCp932: boolean;
	normalizeText: boolean;
	emitEscPrintMode: boolean;
	escposPrintMode?: EscposPrintModeState;
	activeScaledLineSpacing?: number;
	imageAssets: ThermalImageAssets;
	imageAlgorithm: ThermalImageAlgorithm;
	imageThreshold: number;
	barcodeMode: ThermalBarcodeMode;
	barcodeImages: ThermalBarcodeImages;
}

export interface ThermalRowDiagnostic {
	columns: number;
	fixedTotal: number;
	resolvedTotal: number;
	hasStar: boolean;
	overflows: boolean;
	warnings: string[];
	widths: number[];
	texts: string[];
	hasScaledText: boolean;
}

export interface ThermalLayoutDiagnostics {
	columns: number;
	rows: ThermalRowDiagnostic[];
}

const CP932_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/;
const FULL_WIDTH_TEXT_RE =
	/[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u;
const KANJI_MODE_ON = [0x1c, 0x26];
const KANJI_MODE_OFF = [0x1c, 0x2e];

export function thermalBarcodeImageKey(input: {
	kind: 'barcode' | 'qrcode';
	value: string;
	barcodeType?: string;
	height?: number;
	size?: number;
}): string {
	return input.kind === 'barcode'
		? `barcode:${input.barcodeType ?? 'code128'}:${input.value}:${input.height ?? 40}`
		: `qrcode:${input.value}:${input.size ?? 4}`;
}

export function thermalImageAssetKey(input: { src: string; width?: number }): string {
	return input.width === undefined ? input.src : `image:${input.width}:${input.src}`;
}

export function renderEscpos(ast: ReceiptNode, options: EscposRenderOptions = {}): Uint8Array {
	const { printerModel, enableCp932 = false, emitEscPrintMode = true } = options;
	const columns = options.columns ?? ast.paperWidth;

	const encoderOpts: Record<string, unknown> = {
		columns,
		imageMode: options.imageMode ?? 'raster',
	};
	if (options.language !== undefined || !printerModel) {
		encoderOpts.language = options.language ?? 'esc-pos';
	}
	if (printerModel) {
		encoderOpts.printerModel = printerModel;
	}

	const encoder = new ReceiptPrinterEncoder(encoderOpts);
	encoder.initialize().codepage('auto');
	const resolvedLanguage = encoder.language as 'esc-pos' | 'star-prnt' | 'star-line';

	const context: RenderContext = {
		columns,
		language: resolvedLanguage,
		align: 'left',
		lineHasText: false,
		supportsCp932: resolvedLanguage === 'esc-pos' && enableCp932,
		normalizeText: resolvedLanguage === 'esc-pos',
		emitEscPrintMode: resolvedLanguage === 'esc-pos' && emitEscPrintMode,
		escposPrintMode:
			resolvedLanguage === 'esc-pos'
				? { bold: false, underline: false, width: 1, height: 1 }
				: undefined,
		imageAssets: options.imageAssets ?? {},
		imageAlgorithm: options.imageAlgorithm ?? 'atkinson',
		imageThreshold: options.imageThreshold ?? 128,
		barcodeMode: options.barcodeMode ?? 'image',
		barcodeImages: options.barcodeImages ?? {},
	};

	walkNodes(encoder, ast.children, context);

	const bytes = encoder.encode();
	if (resolvedLanguage !== 'esc-pos') return bytes;
	const resetIndex = bytes.findIndex((byte, index) => byte === 0x1b && bytes[index + 1] === 0x40);
	if (resetIndex > 0) return bytes.slice(resetIndex);
	if (resetIndex === -1) return Uint8Array.from([0x1b, 0x40, ...bytes]);
	return bytes;
}

/**
 * Resolve star-width columns to concrete character counts.
 * Fixed columns keep their width; star columns split the remaining space equally.
 */
export function resolveThermalRowWidths(cols: readonly ColNode[], totalColumns: number): number[] {
	let fixedTotal = 0;
	let starCount = 0;

	for (const col of cols) {
		if (col.width === '*') {
			starCount++;
		} else {
			fixedTotal += col.width;
		}
	}

	const remaining = Math.max(0, totalColumns - fixedTotal);
	const starWidth = starCount > 0 ? Math.floor(remaining / starCount) : 0;
	const starRemainder = starCount > 0 ? remaining - starWidth * starCount : 0;

	let starIndex = 0;
	return cols.map((col) => {
		if (col.width !== '*') return col.width;
		starIndex++;
		const extra = starIndex === starCount ? starRemainder : 0;
		return Math.max(1, starWidth + extra);
	});
}

export function analyzeThermalAst(ast: ReceiptNode, columns: number): ThermalLayoutDiagnostics {
	const rows: ThermalRowDiagnostic[] = [];
	collectRowDiagnostics(ast.children, columns, rows);
	return { columns, rows };
}

function walkNodes(
	encoder: ReceiptPrinterEncoder,
	nodes: ThermalNode[],
	context: RenderContext
): void {
	for (const node of nodes) {
		walkNode(encoder, node, context);
	}
}

function walkNode(encoder: ReceiptPrinterEncoder, node: ThermalNode, context: RenderContext): void {
	switch (node.type) {
		case 'raw-text':
			if (writeAlignedRawTextLine(encoder, node.value, context)) {
				break;
			}
			writeText(encoder, node.value, context.supportsCp932, context.normalizeText);
			if (node.value) context.lineHasText = true;
			break;
		case 'text':
			if (writeAlignedStandaloneTextLine(encoder, node.children, context)) {
				break;
			}
			if (writeIndentedStandaloneTextLine(encoder, node.children, context)) {
				break;
			}
			walkNodes(encoder, node.children, context);
			if (context.lineHasText) {
				writeNewline(encoder, context);
			}
			break;
		case 'bold': {
			const previous = context.escposPrintMode?.bold ?? false;
			encoder.bold(true);
			updateEscposPrintMode(encoder, context, { bold: true });
			walkNodes(encoder, node.children, context);
			encoder.bold(previous);
			updateEscposPrintMode(encoder, context, { bold: previous });
			break;
		}
		case 'underline': {
			const previous = context.escposPrintMode?.underline ?? false;
			encoder.underline(true);
			updateEscposPrintMode(encoder, context, { underline: true });
			walkNodes(encoder, node.children, context);
			encoder.underline(previous);
			updateEscposPrintMode(encoder, context, { underline: previous });
			break;
		}
		case 'invert':
			encoder.invert(true);
			walkNodes(encoder, node.children, context);
			encoder.invert(false);
			break;
		case 'size': {
			const previousWidth = context.escposPrintMode?.width ?? 1;
			const previousHeight = context.escposPrintMode?.height ?? 1;
			if (context.escposPrintMode !== undefined && node.height > 1) {
				// ESC 3 n — set line spacing to n/180". The default LF after
				// double-height text advances by ~30/180", which is too small for
				// the taller character cell, so the next line overlaps. Scale
				// spacing with the active height multiplier.
				context.activeScaledLineSpacing = Math.max(
					context.activeScaledLineSpacing || 1,
					node.height
				);
				encoder.raw([0x1b, 0x33, Math.min(255, context.activeScaledLineSpacing * 30)]);
			}
			updateEscposSize(encoder, context, node.width, node.height);
			walkNodes(encoder, node.children, context);
			updateEscposSize(encoder, context, previousWidth, previousHeight);
			break;
		}
		case 'align': {
			const previous = context.align;
			context.align = node.mode;
			encoder.align(node.mode);
			walkNodes(encoder, node.children, context);
			context.align = previous;
			encoder.align(previous);
			break;
		}
		case 'row': {
			const resolvedWidths = resolveThermalRowWidths(node.children, context.columns);
			const resolvedTotal = resolvedWidths.reduce((total, width) => total + width, 0);
			if (resolvedTotal > context.columns) {
				console.warn(
					`thermal row columns (${resolvedTotal}) exceed total width (${context.columns})`
				);
			}
			const rowData = node.children.map((col) => {
				const text = extractText(col.children);
				return context.normalizeText ? normalizeThermalText(text) : text;
			});
			if (context.supportsCp932 && rowData.some(containsJapaneseText)) {
				writeText(
					encoder,
					formatRow(rowData, resolvedWidths, node.children),
					context.supportsCp932,
					context.normalizeText
				);
				writeNewline(encoder, context);
			} else {
				const colDefs = node.children.map((col, i) => ({
					width: resolvedWidths[i],
					align: col.align as 'left' | 'right',
				}));
				encoder.table(colDefs, [rowData]);
				writeNewline(encoder, context);
			}
			break;
		}
		case 'col':
			break;
		case 'line':
			if (node.style === 'double') {
				encoder.rule({ style: 'double' });
			} else {
				encoder.rule();
			}
			break;
		case 'barcode':
			if (context.barcodeMode === 'image') {
				const asset =
					context.barcodeImages[
						thermalBarcodeImageKey({
							kind: 'barcode',
							value: node.value,
							barcodeType: node.barcodeType,
							height: node.height,
						})
					];
				if (asset) {
					writeImage(encoder, asset.image, {
						width: normalizeImageWidth(asset.width),
						height: normalizeImageHeight(asset.height),
						algorithm: asset.algorithm ?? context.imageAlgorithm,
						threshold: asset.threshold ?? context.imageThreshold,
					});
					break;
				}
			}
			encoder.barcode(node.value, node.barcodeType, node.height);
			break;
		case 'qrcode':
			if (context.barcodeMode === 'image') {
				const asset =
					context.barcodeImages[
						thermalBarcodeImageKey({
							kind: 'qrcode',
							value: node.value,
							size: node.size,
						})
					];
				if (asset) {
					writeImage(encoder, asset.image, {
						width: normalizeImageWidth(asset.width),
						height: normalizeImageHeight(asset.height),
						algorithm: asset.algorithm ?? context.imageAlgorithm,
						threshold: asset.threshold ?? context.imageThreshold,
					});
					break;
				}
			}
			encoder.qrcode(node.value, 2, node.size);
			break;
		case 'image': {
			const asset =
				context.imageAssets[thermalImageAssetKey({ src: node.src, width: node.width })] ??
				context.imageAssets[node.src];
			if (!asset) break;
			const width = normalizeImageWidth(asset.width);
			const height = normalizeImageHeight(asset.height);
			writeImage(encoder, asset.image, {
				width,
				height,
				algorithm: asset.algorithm ?? context.imageAlgorithm,
				threshold: asset.threshold ?? context.imageThreshold,
			});
			break;
		}
		case 'cut':
			encoder.cut(node.cutType === 'full' ? 'full' : 'partial');
			break;
		case 'feed':
			writeNewline(encoder, context, node.lines);
			break;
		case 'drawer':
			encoder.pulse();
			break;
		case 'receipt':
			walkNodes(encoder, node.children, context);
			break;
	}
}

function writeNewline(encoder: ReceiptPrinterEncoder, context: RenderContext, lines = 1): void {
	if (!context.escposPrintMode) {
		encoder.newline(lines);
		context.lineHasText = false;
		return;
	}

	const count = Number.isFinite(lines) ? Math.max(1, Math.floor(lines)) : 1;
	encoder.newline();
	if (context.activeScaledLineSpacing !== undefined) {
		// ESC 2 — restore default line spacing after the enlarged line breaks.
		encoder.raw([0x1b, 0x32]);
		context.activeScaledLineSpacing = undefined;
	}
	if (count > 1) {
		encoder.newline(count - 1);
	}
	context.lineHasText = false;
}

function normalizeImageWidth(value: number): number {
	const finite = Number.isFinite(value) ? Math.max(8, Math.floor(value)) : 8;
	return Math.max(8, finite - (finite % 8));
}

function normalizeImageHeight(value: number): number {
	const finite = Number.isFinite(value) ? Math.max(8, Math.floor(value)) : 8;
	return finite + ((8 - (finite % 8)) % 8);
}

function writeImage(
	encoder: ReceiptPrinterEncoder,
	image: unknown,
	options: {
		width: number;
		height: number;
		algorithm: ThermalImageAlgorithm;
		threshold: number;
	}
): void {
	encoder.image(image, options.width, options.height, options.algorithm, options.threshold);
}

function updateEscposPrintMode(
	encoder: ReceiptPrinterEncoder,
	context: RenderContext,
	patch: Partial<EscposPrintModeState>
): void {
	if (!context.escposPrintMode) return;
	Object.assign(context.escposPrintMode, patch);
	if (!context.emitEscPrintMode) return;
	if (context.escposPrintMode.width > 2 || context.escposPrintMode.height > 2) return;
	encoder.raw([0x1b, 0x21, escposPrintModeByte(context.escposPrintMode)]);
}

function updateEscposSize(
	encoder: ReceiptPrinterEncoder,
	context: RenderContext,
	width: number,
	height: number
): void {
	if (!context.escposPrintMode) {
		encoder.size(width, height);
		return;
	}
	Object.assign(context.escposPrintMode, { width, height });
	if (!context.emitEscPrintMode) {
		encoder.size(width, height);
		return;
	}
	if (width > 2 || height > 2) {
		encoder.raw([
			0x1b,
			0x21,
			escposPrintModeByte({ ...context.escposPrintMode, width: 1, height: 1 }),
		]);
		encoder.size(width, height);
		return;
	}
	encoder.size(width, height);
	encoder.raw([0x1b, 0x21, escposPrintModeByte(context.escposPrintMode)]);
}

function escposPrintModeByte(mode: EscposPrintModeState): number {
	return (
		(mode.bold ? 0x08 : 0) |
		(mode.height > 1 ? 0x10 : 0) |
		(mode.width > 1 ? 0x20 : 0) |
		(mode.underline ? 0x80 : 0)
	);
}

function writeText(
	encoder: ReceiptPrinterEncoder,
	value: string,
	supportsCp932: boolean,
	normalizeText: boolean
): void {
	const normalized = normalizeText ? normalizeThermalText(value) : value;
	if (!supportsCp932 || !containsJapaneseText(normalized)) {
		encoder.text(normalized);
		return;
	}

	encoder.raw([...KANJI_MODE_ON, ...iconv.encode(normalized, 'cp932'), ...KANJI_MODE_OFF]);
}

/**
 * Preserve leading spaces on a standalone left-aligned `<text>` line by routing
 * it through the encoder's table layout (which honours `marginLeft`) instead of
 * `encoder.text()` (which trims leading whitespace).
 *
 * Limitation: only triggers when the `<text>` node has a single raw-text child.
 * Mixed-content nodes like `<text>  Discount: <bold>{{label}}</bold></text>`
 * fall through to plain `encoder.text()` and lose their leading spaces. Also
 * skipped while text size is scaled (the table layout doesn't account for
 * scaled glyph width), inside non-left alignment, and on the Japanese (CP932)
 * path. Templates that need indentation in those cases should use a
 * `<row>`/`<col>` layout instead of leading-space text.
 */
function writeIndentedStandaloneTextLine(
	encoder: ReceiptPrinterEncoder,
	nodes: ThermalNode[],
	context: RenderContext
): boolean {
	const activeWidth = context.escposPrintMode?.width ?? 1;
	const activeHeight = context.escposPrintMode?.height ?? 1;
	if (
		context.align !== 'left' ||
		activeWidth > 1 ||
		activeHeight > 1 ||
		nodes.length !== 1 ||
		nodes[0]?.type !== 'raw-text'
	) {
		return false;
	}

	const normalized = context.normalizeText ? normalizeThermalText(nodes[0].value) : nodes[0].value;
	const leadingSpaces = normalized.match(/^ +/)?.[0] ?? '';
	const rest = normalized.slice(leadingSpaces.length);
	if (
		!leadingSpaces ||
		!rest ||
		(context.supportsCp932 && containsJapaneseText(normalized)) ||
		displayWidth(normalized) > context.columns
	) {
		return false;
	}

	encoder.table(
		[
			{
				width: Math.max(1, context.columns - leadingSpaces.length),
				marginLeft: leadingSpaces.length,
				align: 'left',
			},
		],
		[[rest]]
	);
	return true;
}

function writeAlignedStandaloneTextLine(
	encoder: ReceiptPrinterEncoder,
	nodes: ThermalNode[],
	context: RenderContext
): boolean {
	const activeWidth = context.escposPrintMode?.width ?? 1;
	const activeHeight = context.escposPrintMode?.height ?? 1;
	if (
		context.align === 'left' ||
		context.lineHasText ||
		activeWidth > 1 ||
		activeHeight > 1 ||
		nodes.length !== 1 ||
		nodes[0]?.type !== 'raw-text'
	) {
		return false;
	}

	const normalized = context.normalizeText ? normalizeThermalText(nodes[0].value) : nodes[0].value;
	if (
		!normalized ||
		(context.supportsCp932 && containsJapaneseText(normalized)) ||
		displayWidth(normalized) > context.columns
	) {
		return false;
	}

	encoder.align('left');
	encoder.table([{ width: context.columns, align: context.align }], [[normalized]]);
	context.lineHasText = false;
	encoder.align(context.align);
	return true;
}

function writeAlignedRawTextLine(
	encoder: ReceiptPrinterEncoder,
	value: string,
	context: RenderContext
): boolean {
	const activeWidth = context.escposPrintMode?.width ?? 1;
	const activeHeight = context.escposPrintMode?.height ?? 1;
	if (context.align === 'left' || context.lineHasText || activeWidth > 1 || activeHeight > 1) {
		return false;
	}

	const normalized = context.normalizeText ? normalizeThermalText(value) : value;
	if (
		!normalized ||
		(context.supportsCp932 && containsJapaneseText(normalized)) ||
		displayWidth(normalized) > context.columns
	) {
		return false;
	}

	encoder.align('left');
	encoder.table([{ width: context.columns, align: context.align }], [[normalized]]);
	context.lineHasText = false;
	encoder.align(context.align);
	return true;
}

function normalizeThermalText(value: string): string {
	return value
		.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/\u00A0/g, ' ');
}

function containsJapaneseText(value: string): boolean {
	return CP932_TEXT_RE.test(value);
}

function formatRow(values: string[], widths: number[], cols: readonly ColNode[]): string {
	return values
		.map((value, index) => {
			const width = widths[index] ?? 0;
			const clipped = truncateDisplay(value, width);
			const padding = ' '.repeat(Math.max(0, width - displayWidth(clipped)));
			return cols[index]?.align === 'right' ? `${padding}${clipped}` : `${clipped}${padding}`;
		})
		.join('');
}

function truncateDisplay(value: string, width: number): string {
	let result = '';
	let used = 0;
	for (const char of value) {
		const next = displayWidth(char);
		if (used + next > width) break;
		result += char;
		used += next;
	}
	return result;
}

function displayWidth(value: string): number {
	let width = 0;
	for (const char of value) {
		width += FULL_WIDTH_TEXT_RE.test(char) ? 2 : 1;
	}
	return width;
}

function extractText(nodes: ThermalNode[]): string {
	return nodes
		.map((n) => {
			if (n.type === 'raw-text') return n.value;
			if ('children' in n) return extractText(n.children);
			return '';
		})
		.join('');
}

function collectRowDiagnostics(
	nodes: readonly ThermalNode[],
	columns: number,
	rows: ThermalRowDiagnostic[]
): void {
	for (const node of nodes) {
		if (node.type === 'row') {
			const fixedTotal = node.children.reduce(
				(total, col) => total + (col.width === '*' ? 0 : col.width),
				0
			);
			const widths = resolveThermalRowWidths(node.children, columns);
			const resolvedTotal = widths.reduce((total, width) => total + width, 0);
			const warnings =
				resolvedTotal > columns
					? [`thermal row columns (${resolvedTotal}) exceed total width (${columns})`]
					: [];
			rows.push({
				columns,
				fixedTotal,
				resolvedTotal,
				hasStar: node.children.some((col) => col.width === '*'),
				overflows: resolvedTotal > columns,
				warnings,
				widths,
				texts: node.children.map((col) => extractText(col.children)),
				hasScaledText: node.children.some((col) => containsScaledText(col.children)),
			});
		}
		if ('children' in node) {
			collectRowDiagnostics(node.children, columns, rows);
		}
	}
}

function containsScaledText(nodes: readonly ThermalNode[]): boolean {
	for (const node of nodes) {
		if (node.type === 'size' && (node.width > 1 || node.height > 1)) return true;
		if ('children' in node && containsScaledText(node.children)) return true;
	}
	return false;
}
