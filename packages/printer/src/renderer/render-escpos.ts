import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

import type { ColNode, ReceiptNode, ThermalNode } from './types';

export interface EscposRenderOptions {
	printerModel?: string;
	language?: 'esc-pos' | 'star-prnt' | 'star-line';
	columns?: number;
}

export function renderEscpos(ast: ReceiptNode, options: EscposRenderOptions = {}): Uint8Array {
	const { printerModel, language = 'esc-pos', columns = ast.paperWidth } = options;

	const encoderOpts: Record<string, unknown> = { language, columns };
	if (printerModel) {
		encoderOpts.printerModel = printerModel;
	}

	const encoder = new ReceiptPrinterEncoder(encoderOpts);
	encoder.initialize().codepage('auto');

	walkNodes(encoder, ast.children, columns);

	return encoder.encode();
}

/**
 * Resolve star-width columns to concrete character counts.
 * Fixed columns keep their width; star columns split the remaining space equally.
 */
function resolveStarColumns(cols: readonly ColNode[], totalColumns: number): number[] {
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
	if (fixedTotal > totalColumns && starCount > 0) {
		console.warn(
			`resolveStarColumns: fixed columns (${fixedTotal}) exceed total width (${totalColumns})`
		);
	}
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

function walkNodes(encoder: ReceiptPrinterEncoder, nodes: ThermalNode[], columns: number): void {
	for (const node of nodes) {
		walkNode(encoder, node, columns);
	}
}

function walkNode(encoder: ReceiptPrinterEncoder, node: ThermalNode, columns: number): void {
	switch (node.type) {
		case 'raw-text':
			encoder.text(node.value);
			break;
		case 'text':
			walkNodes(encoder, node.children, columns);
			encoder.newline();
			break;
		case 'bold':
			encoder.bold(true);
			walkNodes(encoder, node.children, columns);
			encoder.bold(false);
			break;
		case 'underline':
			encoder.underline(true);
			walkNodes(encoder, node.children, columns);
			encoder.underline(false);
			break;
		case 'invert':
			encoder.invert(true);
			walkNodes(encoder, node.children, columns);
			encoder.invert(false);
			break;
		case 'size':
			encoder.size(node.width, node.height);
			walkNodes(encoder, node.children, columns);
			encoder.size(1, 1);
			break;
		case 'align':
			encoder.align(node.mode);
			walkNodes(encoder, node.children, columns);
			encoder.align('left');
			break;
		case 'row': {
			const resolvedWidths = resolveStarColumns(node.children, columns);
			const colDefs = node.children.map((col, i) => ({
				width: resolvedWidths[i],
				align: col.align as 'left' | 'right',
			}));
			const rowData = node.children.map((col) => extractText(col.children));
			encoder.table(colDefs, [rowData]);
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
			encoder.barcode(node.value, node.barcodeType, node.height);
			break;
		case 'qrcode':
			encoder.qrcode(node.value, 2, node.size);
			break;
		case 'image':
			// Image encoding requires actual image data — skip in base implementation
			break;
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
			walkNodes(encoder, node.children, columns);
			break;
	}
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
