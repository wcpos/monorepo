import {
	extractText,
	formatRow,
	formatThermalTableCell,
	normalizeThermalText,
	resolveThermalRowWidths,
	thermalBarcodeImageKey,
	thermalImageAssetKey,
} from './render-escpos';

import type {
	DrawerConnector,
	ReceiptNode,
	ThermalBarcodeImages,
	ThermalBarcodeMode,
	ThermalImageAssets,
	ThermalNode,
	ThermalPixelBuffer,
	ThermalRasterImage,
} from './types';

export interface EposRenderOptions {
	columns?: number;
	imageAssets?: ThermalImageAssets;
	barcodeImages?: ThermalBarcodeImages;
	barcodeMode?: ThermalBarcodeMode;
	openDrawer?: boolean;
	drawerConnector?: DrawerConnector;
}

interface EposContext {
	columns: number;
	align: 'left' | 'center' | 'right';
	bold: boolean;
	underline: boolean;
	invert: boolean;
	width: number;
	height: number;
	imageAssets: ThermalImageAssets;
	barcodeImages: ThermalBarcodeImages;
	barcodeMode: ThermalBarcodeMode;
	drawerConnector: DrawerConnector;
}

const BARCODE_TYPES: Record<string, string> = {
	code39: 'code39',
	code128: 'code128',
	ean13: 'ean13',
	ean8: 'ean8',
	upca: 'upc_a',
	upce: 'upc_e',
	itf: 'itf',
	codabar: 'codabar',
};

export function renderEposXml(ast: ReceiptNode, options: EposRenderOptions = {}): string {
	const context: EposContext = {
		columns: options.columns ?? ast.paperWidth,
		align: 'left',
		bold: false,
		underline: false,
		invert: false,
		width: 1,
		height: 1,
		imageAssets: options.imageAssets ?? {},
		barcodeImages: options.barcodeImages ?? {},
		barcodeMode: options.barcodeMode ?? 'image',
		drawerConnector: options.drawerConnector ?? 'pin2',
	};
	const output = renderNodes(ast.children, context);
	if (options.openDrawer === true && !containsDrawer(ast)) {
		output.push(drawerXml(context.drawerConnector));
	}
	return output.join('');
}

function renderNodes(nodes: readonly ThermalNode[], context: EposContext): string[] {
	return nodes.flatMap((node) => renderNode(node, context));
}

function renderNode(node: ThermalNode, context: EposContext): string[] {
	switch (node.type) {
		case 'raw-text':
			return [textXml(normalizeThermalText(node.value), context)];
		case 'text': {
			const output = renderNodes(node.children, context);
			appendNewline(output, context);
			return output;
		}
		case 'bold':
			return renderNodes(node.children, { ...context, bold: true });
		case 'underline':
			return renderNodes(node.children, { ...context, underline: true });
		case 'invert':
			return renderNodes(node.children, { ...context, invert: true });
		case 'size':
			return renderNodes(node.children, {
				...context,
				width: clampSize(node.width),
				height: clampSize(node.height),
			});
		case 'align':
			return renderNodes(node.children, { ...context, align: node.mode });
		case 'row': {
			const widths = resolveThermalRowWidths(node.children, context.columns);
			const values = node.children.map((col, index) => {
				const value = normalizeThermalText(extractText(col.children));
				const cell = formatThermalTableCell(value, widths[index] ?? 1, col);
				return `${' '.repeat(cell.column.marginLeft ?? 0)}${cell.text}`;
			});
			return [textXml(`${formatRow(values, widths, node.children)}\n`, context)];
		}
		case 'col':
			return [];
		case 'line':
			return [
				textXml(`${(node.style === 'double' ? '=' : '-').repeat(context.columns)}\n`, context),
			];
		case 'feed':
			return [`<feed line="${positiveInteger(node.lines)}"/>`];
		case 'cut':
			return ['<cut type="feed"/>'];
		case 'drawer':
			return [drawerXml(node.connector ?? context.drawerConnector)];
		case 'image': {
			const asset =
				context.imageAssets[thermalImageAssetKey({ src: node.src, width: node.width })] ??
				context.imageAssets[node.src];
			return asset ? [imageXml(asset, context)] : [];
		}
		case 'barcode': {
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
				if (asset) return [imageXml(asset, context)];
			}
			const type = BARCODE_TYPES[node.barcodeType.trim().toLowerCase()];
			return type
				? [
						`<barcode type="${type}" hri="below" font="font_a" width="2" height="${positiveInteger(node.height)}">${escapeXml(node.value)}</barcode>`,
					]
				: [textXml(node.value, context)];
		}
		case 'qrcode': {
			if (context.barcodeMode === 'image') {
				const asset =
					context.barcodeImages[
						thermalBarcodeImageKey({ kind: 'qrcode', value: node.value, size: node.size })
					];
				if (asset) return [imageXml(asset, context)];
			}
			return [
				`<symbol type="qrcode_model_2" level="level_m" width="${positiveInteger(node.size || 3)}">${escapeXml(node.value)}</symbol>`,
			];
		}
		case 'receipt':
			return renderNodes(node.children, context);
	}
}

function textXml(value: string, context: EposContext): string {
	const attributes = [
		`align="${context.align}"`,
		context.bold ? 'em="true"' : '',
		context.underline ? 'ul="true"' : '',
		context.invert ? 'reverse="true"' : '',
		`width="${context.width}"`,
		`height="${context.height}"`,
		'font="font_a"',
	].filter(Boolean);
	return `<text ${attributes.join(' ')}>${escapeXml(value)}</text>`;
}

function appendNewline(output: string[], context: EposContext): void {
	for (let index = output.length - 1; index >= 0; index--) {
		if (output[index]?.endsWith('</text>')) {
			output[index] = output[index]!.replace(/<\/text>$/, '&#10;</text>');
			return;
		}
	}
	output.push(textXml('\n', context));
}

function imageXml(asset: ThermalRasterImage, context: EposContext): string {
	return `<image width="${asset.width}" height="${asset.height}" color="color_1" mode="mono" align="${context.align}">${thermalRasterToBase64(asset.image, asset.threshold)}</image>`;
}

export function thermalRasterToBase64(image: ThermalPixelBuffer, threshold = 128): string {
	const bytes: number[] = [];
	for (let y = 0; y < image.height; y++) {
		for (let byteX = 0; byteX < Math.ceil(image.width / 8); byteX++) {
			let byte = 0;
			for (let bit = 0; bit < 8; bit++) {
				const x = byteX * 8 + bit;
				if (x >= image.width) continue;
				const offset = (y * image.width + x) * 4;
				const alpha = image.data[offset + 3] ?? 0;
				const luminance =
					((image.data[offset] ?? 255) +
						(image.data[offset + 1] ?? 255) +
						(image.data[offset + 2] ?? 255)) /
					3;
				if (alpha > 0 && luminance < threshold) byte |= 0x80 >> bit;
			}
			bytes.push(byte);
		}
	}
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function escapeXml(value: string): string {
	return value
		.replace(/\r\n?|\n/g, '\n')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/\n/g, '&#10;');
}

function drawerXml(connector: DrawerConnector): string {
	return `<pulse drawer="${connector === 'pin5' ? 'drawer_2' : 'drawer_1'}" time="pulse_100"/>`;
}

function containsDrawer(node: ThermalNode): boolean {
	if (node.type === 'drawer') return true;
	return 'children' in node && node.children.some(containsDrawer);
}

function clampSize(value: number): number {
	return Math.min(8, Math.max(1, positiveInteger(value)));
}

function positiveInteger(value: number): number {
	return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}
