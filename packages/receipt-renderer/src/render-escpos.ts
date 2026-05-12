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
	ThermalRasterImage,
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
	fullReceiptRasterImage?: ThermalRasterImage;
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
	allowAlignedRawTextLine: boolean;
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

interface EncodedReceiptPrinterCommand {
	type?: string;
	payload?: ArrayLike<number>;
}

interface ReceiptPrinterEncoderWithCapabilities extends ReceiptPrinterEncoder {
	readonly printerCapabilities?: {
		readonly newline?: string;
	};
}

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
		allowAlignedRawTextLine: true,
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

	if (options.fullReceiptRasterImage) {
		const image = options.fullReceiptRasterImage;
		writeImage(encoder, image.image, {
			width: normalizeImageWidth(image.width),
			height: normalizeImageHeight(image.height),
			algorithm: image.algorithm ?? context.imageAlgorithm,
			threshold: image.threshold ?? context.imageThreshold,
		});
		writePostRasterCommands(encoder, ast.children, context);
		return normalizeEscposBytes(encodeReceiptPrinterBytesSafely(encoder), resolvedLanguage);
	}

	walkNodes(encoder, ast.children, context);

	return normalizeEscposBytes(encoder.encode(), resolvedLanguage);
}

function normalizeEscposBytes(
	bytes: Uint8Array,
	resolvedLanguage: 'esc-pos' | 'star-prnt' | 'star-line'
): Uint8Array {
	if (resolvedLanguage !== 'esc-pos') return bytes;
	const resetIndex = bytes.findIndex((byte, index) => byte === 0x1b && bytes[index + 1] === 0x40);
	if (resetIndex > 0) return bytes.slice(resetIndex);
	if (resetIndex === -1) return Uint8Array.from([0x1b, 0x40, ...bytes]);
	return bytes;
}

function writePostRasterCommands(
	encoder: ReceiptPrinterEncoder,
	nodes: readonly ThermalNode[],
	context: RenderContext
): void {
	const trailingControls: ThermalNode[] = [];
	for (let index = nodes.length - 1; index >= 0; index--) {
		const node = nodes[index];
		if (!node || !isThermalControlNode(node)) break;
		trailingControls.unshift(node);
	}

	for (const node of trailingControls) {
		walkNode(encoder, node, context);
	}
}

function isThermalControlNode(node: ThermalNode): boolean {
	return node.type === 'cut' || node.type === 'feed' || node.type === 'drawer';
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
			if (
				context.allowAlignedRawTextLine &&
				writeAlignedRawTextLine(encoder, node.value, context)
			) {
				break;
			}
			writeText(encoder, node.value, context.supportsCp932, context.normalizeText);
			if (node.value) context.lineHasText = true;
			break;
		case 'text': {
			if (writeAlignedStandaloneTextLine(encoder, node.children, context)) {
				break;
			}
			if (writeIndentedStandaloneTextLine(encoder, node.children, context)) {
				break;
			}
			const previousAllowAlignedRawTextLine = context.allowAlignedRawTextLine;
			context.allowAlignedRawTextLine = false;
			walkNodes(encoder, node.children, context);
			context.allowAlignedRawTextLine = previousAllowAlignedRawTextLine;
			writeNewline(encoder, context);
			break;
		}
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
			writePrinterAlign(encoder, context, node.mode);
			if (!writeAlignedStandaloneTextLine(encoder, node.children, context)) {
				walkAlignedNodes(encoder, node.children, context);
			}
			context.align = previous;
			writePrinterAlign(encoder, context, previous);
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
				const formattedCells = rowData.map((text, i) =>
					formatThermalTableCell(text, resolvedWidths[i] ?? 1, node.children[i])
				);
				encoder.table(
					formattedCells.map((cell) => cell.column),
					[formattedCells.map((cell) => cell.text)]
				);
				restoreActiveLineSpacing(encoder, context);
				context.lineHasText = false;
			}
			break;
		}
		case 'col':
			break;
		case 'line':
			if (node.style === 'double') {
				encoder.rule({ style: 'double' });
			} else if (node.style === 'dashed' || node.style === 'dotted') {
				const pattern = node.style === 'dashed' ? '-' : '. ';
				const text = pattern
					.repeat(Math.ceil(context.columns / pattern.length))
					.slice(0, context.columns);
				writeText(encoder, text, context.supportsCp932, context.normalizeText);
				writeNewline(encoder, context);
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

function walkAlignedNodes(
	encoder: ReceiptPrinterEncoder,
	nodes: ThermalNode[],
	context: RenderContext
): void {
	for (let index = 0; index < nodes.length; index++) {
		const node = nodes[index];
		walkNode(encoder, node, context);
		if (context.lineHasText && isDirectStyledHeading(node) && nodes[index + 1]?.type === 'text') {
			writeNewline(encoder, context);
		}
	}
}

function isDirectStyledHeading(node: ThermalNode): boolean {
	return (
		node.type === 'bold' ||
		node.type === 'underline' ||
		node.type === 'invert' ||
		node.type === 'size'
	);
}

function writeNewline(encoder: ReceiptPrinterEncoder, context: RenderContext, lines = 1): void {
	if (!context.escposPrintMode) {
		encoder.newline(lines);
		context.lineHasText = false;
		return;
	}

	const count = Number.isFinite(lines) ? Math.max(1, Math.floor(lines)) : 1;
	encoder.newline();
	restoreActiveLineSpacing(encoder, context);
	if (count > 1) {
		encoder.newline(count - 1);
	}
	context.lineHasText = false;
}

function restoreActiveLineSpacing(encoder: ReceiptPrinterEncoder, context: RenderContext): void {
	if (context.activeScaledLineSpacing === undefined) return;
	// ESC 2 — restore default line spacing after the enlarged line breaks.
	encoder.raw([0x1b, 0x32]);
	context.activeScaledLineSpacing = undefined;
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

function encodeReceiptPrinterBytesSafely(encoder: ReceiptPrinterEncoder): Uint8Array {
	const encodeLines = encoder.encode as unknown as (
		mode: 'lines'
	) => EncodedReceiptPrinterCommand[][];
	const lines = encodeLines.call(encoder, 'lines');
	const newlineBytes = receiptPrinterNewlineBytes(encoder);
	const bytes: number[] = [];
	let lastCommand: EncodedReceiptPrinterCommand | undefined;

	for (const line of lines) {
		for (const command of line) {
			appendPayload(bytes, command.payload);
			lastCommand = command;
		}
		bytes.push(...newlineBytes);
	}

	if (lastCommand?.type === 'pulse') {
		bytes.splice(Math.max(0, bytes.length - newlineBytes.length), newlineBytes.length);
	}

	return Uint8Array.from(bytes);
}

function receiptPrinterNewlineBytes(encoder: ReceiptPrinterEncoder): number[] {
	const newline =
		(encoder as ReceiptPrinterEncoderWithCapabilities).printerCapabilities?.newline ?? '\n\r';
	const bytes: number[] = [];
	for (let index = 0; index < newline.length; index++) {
		bytes.push(newline.charCodeAt(index));
	}
	return bytes;
}

function appendPayload(bytes: number[], payload: ArrayLike<number> | undefined): void {
	if (!payload) return;
	for (let index = 0; index < payload.length; index++) {
		bytes.push(payload[index] ?? 0);
	}
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
	if (
		context.align === 'left' ||
		context.lineHasText ||
		!isInlineTextContent(nodes) ||
		containsScaledText(nodes)
	) {
		return false;
	}

	const text = extractText(nodes);
	const normalized = context.normalizeText ? normalizeThermalText(text) : text;
	if (
		!normalized ||
		hasLineBreak(normalized) ||
		(context.supportsCp932 && containsJapaneseText(normalized)) ||
		displayWidth(normalized) > context.columns
	) {
		return false;
	}

	const padding = alignedPadding(normalized, context.columns, context.align, activeWidth);
	if (padding === undefined) return false;
	writePrinterAlign(encoder, context, 'left');
	if (padding) {
		writeRawSpaces(encoder, padding.length);
	}
	walkNodes(encoder, nodes, {
		...context,
		align: 'left',
		lineHasText: false,
		allowAlignedRawTextLine: false,
		escposPrintMode: context.escposPrintMode ? { ...context.escposPrintMode } : undefined,
		activeScaledLineSpacing: undefined,
	});
	context.lineHasText = true;
	writeNewline(encoder, context);
	writePrinterAlign(encoder, context, context.align);
	return true;
}

function writeAlignedRawTextLine(
	encoder: ReceiptPrinterEncoder,
	value: string,
	context: RenderContext
): boolean {
	const activeWidth = context.escposPrintMode?.width ?? 1;
	const activeHeight = context.escposPrintMode?.height ?? 1;
	if (context.align === 'left' || context.lineHasText || (activeHeight > 1 && activeWidth === 1)) {
		return false;
	}

	const normalized = context.normalizeText ? normalizeThermalText(value) : value;
	if (
		!normalized ||
		hasLineBreak(normalized) ||
		(context.supportsCp932 && containsJapaneseText(normalized)) ||
		displayWidth(normalized) > context.columns
	) {
		return false;
	}

	const padding = alignedPadding(normalized, context.columns, context.align, activeWidth);
	if (padding === undefined) return false;
	writePrinterAlign(encoder, context, 'left');
	if (padding) {
		writeRawSpaces(encoder, padding.length);
	}
	writeText(encoder, normalized, context.supportsCp932, context.normalizeText);
	context.lineHasText = true;
	writeNewline(encoder, context);
	writePrinterAlign(encoder, context, context.align);
	return true;
}

function writePrinterAlign(
	encoder: ReceiptPrinterEncoder,
	context: RenderContext,
	align: 'left' | 'center' | 'right'
): void {
	// The encoder de-duplicates alignment state, but our physically padded
	// text lines need an explicit ESC/POS alignment byte before the spaces.
	// Otherwise a printer can keep the previous centered mode while receiving
	// left-margin padding, which is the failure this path avoids.
	encoder.align(align);
	if (context.language !== 'esc-pos') return;
	const value = align === 'center' ? 0x01 : align === 'right' ? 0x02 : 0x00;
	encoder.raw([0x1b, 0x61, value]);
}

function writeRawSpaces(encoder: ReceiptPrinterEncoder, count: number): void {
	if (count <= 0) return;
	encoder.raw(new Array(count).fill(0x20));
}

function alignedPadding(
	value: string,
	columns: number,
	align: 'center' | 'right',
	activeWidth: number
): string | undefined {
	const visualWidth = displayWidth(value) * activeWidth;
	if (visualWidth > columns) return undefined;
	const remaining = Math.max(0, columns - visualWidth);
	const visualPadding = align === 'center' ? Math.floor(remaining / 2) : remaining;
	const paddingCharacters = Math.floor(visualPadding / activeWidth);
	return ' '.repeat(paddingCharacters);
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

function hasLineBreak(value: string): boolean {
	return value.includes('\n') || value.includes('\r');
}

function formatThermalTableCell(
	text: string,
	width: number,
	col: ColNode | undefined
): {
	text: string;
	column: { width: number; align?: 'left' | 'right'; marginLeft?: number };
} {
	const align = col?.align as 'left' | 'right' | undefined;
	if (align !== 'left') {
		return { text, column: { width, align } };
	}

	const leadingSpaces = text.match(/^ +/)?.[0].length ?? 0;
	const marginLeft = Math.min(leadingSpaces, Math.max(0, width - 1));
	if (!marginLeft || marginLeft >= text.length) {
		return { text, column: { width, align } };
	}

	return {
		text: text.slice(marginLeft),
		column: {
			width: Math.max(1, width - marginLeft),
			align,
			marginLeft,
		},
	};
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

function isInlineTextContent(nodes: readonly ThermalNode[]): boolean {
	return (
		nodes.length > 0 &&
		nodes.every((node) => {
			switch (node.type) {
				case 'raw-text':
					return true;
				case 'bold':
				case 'underline':
				case 'invert':
				case 'size':
					return isInlineTextContent(node.children);
				default:
					return false;
			}
		})
	);
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
