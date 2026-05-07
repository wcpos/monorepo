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
	imageMode?: ThermalImageMode;
	imageAssets?: ThermalImageAssets;
	imageAlgorithm?: ThermalImageAlgorithm;
	imageThreshold?: number;
	barcodeMode?: ThermalBarcodeMode;
	barcodeImages?: ThermalBarcodeImages;
}

interface RenderContext {
	columns: number;
	supportsCp932: boolean;
	normalizeText: boolean;
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
	const {
		printerModel,
		language = 'esc-pos',
		columns = ast.paperWidth,
		enableCp932 = false,
	} = options;

	const encoderOpts: Record<string, unknown> = {
		language,
		columns,
		imageMode: options.imageMode ?? 'raster',
	};
	if (printerModel) {
		encoderOpts.printerModel = printerModel;
	}

	const encoder = new ReceiptPrinterEncoder(encoderOpts);
	encoder.initialize().codepage('auto');

	const context: RenderContext = {
		columns,
		supportsCp932: language === 'esc-pos' && enableCp932,
		normalizeText: language === 'esc-pos',
		imageAssets: options.imageAssets ?? {},
		imageAlgorithm: options.imageAlgorithm ?? 'atkinson',
		imageThreshold: options.imageThreshold ?? 128,
		barcodeMode: options.barcodeMode ?? 'image',
		barcodeImages: options.barcodeImages ?? {},
	};

	walkNodes(encoder, ast.children, context);

	const bytes = encoder.encode();
	if (language !== 'esc-pos') return bytes;
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
			writeText(encoder, node.value, context.supportsCp932, context.normalizeText);
			break;
		case 'text':
			walkNodes(encoder, node.children, context);
			encoder.newline();
			break;
		case 'bold':
			encoder.bold(true);
			walkNodes(encoder, node.children, context);
			encoder.bold(false);
			break;
		case 'underline':
			encoder.underline(true);
			walkNodes(encoder, node.children, context);
			encoder.underline(false);
			break;
		case 'invert':
			encoder.invert(true);
			walkNodes(encoder, node.children, context);
			encoder.invert(false);
			break;
		case 'size':
			encoder.size(node.width, node.height);
			walkNodes(encoder, node.children, context);
			encoder.size(1, 1);
			break;
		case 'align':
			encoder.align(node.mode);
			walkNodes(encoder, node.children, context);
			encoder.align('left');
			break;
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
				encoder.newline();
			} else {
				const colDefs = node.children.map((col, i) => ({
					width: resolvedWidths[i],
					align: col.align as 'left' | 'right',
				}));
				encoder.table(colDefs, [rowData]);
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
					encoder.image(
						asset.image,
						normalizeImageWidth(asset.width),
						normalizeImageHeight(asset.height),
						asset.algorithm ?? context.imageAlgorithm,
						asset.threshold ?? context.imageThreshold
					);
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
					encoder.image(
						asset.image,
						normalizeImageWidth(asset.width),
						normalizeImageHeight(asset.height),
						asset.algorithm ?? context.imageAlgorithm,
						asset.threshold ?? context.imageThreshold
					);
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
			encoder.image(
				asset.image,
				width,
				height,
				asset.algorithm ?? context.imageAlgorithm,
				asset.threshold ?? context.imageThreshold
			);
			break;
		}
		case 'cut':
			encoder.cut(node.cutType === 'full' ? 'full' : 'partial');
			break;
		case 'feed':
			encoder.newline(node.lines);
			break;
		case 'drawer':
			encoder.pulse();
			break;
		case 'receipt':
			walkNodes(encoder, node.children, context);
			break;
	}
}

function normalizeImageWidth(value: number): number {
	const finite = Number.isFinite(value) ? Math.max(8, Math.floor(value)) : 8;
	return Math.max(8, finite - (finite % 8));
}

function normalizeImageHeight(value: number): number {
	const finite = Number.isFinite(value) ? Math.max(8, Math.floor(value)) : 8;
	return finite + ((8 - (finite % 8)) % 8);
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
