import { describe, expect, it } from 'vitest';

import { buildDiagnosticTemplate } from '../../../printer/src/encoder/diagnostic-template';
import {
	encodeThermalTemplateToEpos,
	formatRow,
	parseXml,
	renderEposXml,
	thermalBarcodeImageKey,
	thermalImageAssetKey,
	thermalRasterToBase64,
} from '../index';

import type { ThermalPixelBuffer, ThermalRasterImage } from '../types';

function render(template: string): string {
	return renderEposXml(parseXml(`<receipt paper-width="10">${template}</receipt>`));
}

function raster(
	width: number,
	height: number,
	blackPixels: [number, number][]
): ThermalRasterImage {
	const data = new Uint8ClampedArray(width * height * 4).fill(255);
	for (const [x, y] of blackPixels) {
		const offset = (y * width + x) * 4;
		data[offset] = 0;
		data[offset + 1] = 0;
		data[offset + 2] = 0;
	}
	return { image: { width, height, data }, width, height };
}

describe('renderEposXml', () => {
	it('renders the receipt as a wrapper only', () => {
		expect(render('<feed/>')).toBe('<feed line="1"/>');
	});

	it('renders text and raw-text runs with a newline', () => {
		expect(render('<text>Hello</text>')).toBe(
			'<text align="left" width="1" height="1" font="font_a">Hello&#10;</text>'
		);
	});

	it('preserves leading spaces on standalone indented text', () => {
		expect(render('<text>  indented</text>')).toContain('>  indented&#10;</text>');
	});

	it('renders bold context', () => {
		expect(render('<bold><text>B</text></bold>')).toContain('em="true"');
	});

	it('renders underline context', () => {
		expect(render('<underline><text>U</text></underline>')).toContain('ul="true"');
	});

	it('renders invert context', () => {
		expect(render('<invert><text>I</text></invert>')).toContain('reverse="true"');
	});

	it('renders clamped size context', () => {
		expect(render('<size width="9" height="4"><text>S</text></size>')).toContain(
			'width="8" height="4"'
		);
	});

	it('renders alignment context', () => {
		expect(render('<align mode="right"><text>R</text></align>')).toContain('align="right"');
	});

	it('renders row and col nodes as a fixed-width line matching formatRow', () => {
		const row = parseXml(
			'<receipt><row><col width="6">Item</col><col width="4" align="right">2.00</col></row></receipt>'
		).children[0];
		if (row?.type !== 'row') throw new Error('Expected row fixture');
		const expected = formatRow(['Item', '2.00'], [6, 4], row.children);
		expect(
			render('<row><col width="6">Item</col><col width="4" align="right">2.00</col></row>')
		).toContain(`${expected}&#10;`);
	});

	it.each(['single', 'dashed', 'dotted'] as const)('renders %s lines with hyphens', (style) => {
		expect(render(`<line style="${style}"/>`)).toContain(`${'-'.repeat(10)}&#10;`);
	});

	it('renders double lines with equals signs', () => {
		expect(render('<line style="double"/>')).toContain(`${'='.repeat(10)}&#10;`);
	});

	it('renders feed nodes', () => {
		expect(render('<feed lines="3"/>')).toBe('<feed line="3"/>');
	});

	it('renders cut nodes', () => {
		expect(render('<cut type="partial"/>')).toBe('<cut type="feed"/>');
	});

	it('renders drawer nodes with the selected connector', () => {
		expect(render('<drawer connector="pin5"/>')).toBe(
			'<pulse drawer="drawer_2" time="pulse_100"/>'
		);
	});

	it('renders native barcodes and falls back to text for unknown types', () => {
		expect(
			renderEposXml(parseXml('<receipt><barcode type="upca" height="50">123</barcode></receipt>'), {
				barcodeMode: 'native',
			})
		).toBe('<barcode type="upc_a" hri="below" font="font_a" width="2" height="50">123</barcode>');
		expect(
			renderEposXml(parseXml('<receipt><barcode type="unknown">ABC</barcode></receipt>'), {
				barcodeMode: 'native',
			})
		).toContain('>ABC</text>');
	});

	it('renders QR symbols', () => {
		expect(render('<qrcode size="5">A&amp;B</qrcode>')).toBe(
			'<symbol type="qrcode_model_2" level="level_m" width="5">A&amp;B</symbol>'
		);
	});

	it('renders image and barcode image assets as monochrome raster data', () => {
		const asset = raster(8, 1, [[0, 0]]);
		const imageKey = thermalImageAssetKey({ src: 'logo', width: 8 });
		const barcodeKey = thermalBarcodeImageKey({
			kind: 'barcode',
			value: 'ABC',
			barcodeType: 'code39',
			height: 40,
		});
		const xml = renderEposXml(
			parseXml(
				'<receipt><image src="logo" width="8"/><barcode type="code39">ABC</barcode></receipt>'
			),
			{
				imageAssets: { [imageKey]: asset },
				barcodeImages: { [barcodeKey]: asset },
				barcodeMode: 'image',
			}
		);
		expect(xml.match(/<image /g)).toHaveLength(2);
		expect(xml).toContain(
			'width="8" height="1" color="color_1" mode="mono" align="left">gA==</image>'
		);
	});

	it('omits missing image assets', () => {
		expect(render('<image src="missing" width="8"/>')).toBe('');
	});

	it('escapes text and line breaks', () => {
		expect(render('<text>&amp; &lt; &quot;\nnext</text>')).toContain(
			'&amp; &lt; &quot;&#10;next&#10;'
		);
	});

	it('appends exactly one configured drawer pulse and never duplicates an explicit drawer', () => {
		expect(
			renderEposXml(parseXml('<receipt><text>A</text></receipt>'), {
				openDrawer: true,
				drawerConnector: 'pin5',
			}).match(/<pulse/g)
		).toHaveLength(1);
		expect(
			renderEposXml(parseXml('<receipt><drawer/></receipt>'), { openDrawer: true }).match(/<pulse/g)
		).toHaveLength(1);
	});

	it.each([48, 32])('renders the %i-column diagnostic template as well-formed XML', (columns) => {
		const inner = encodeThermalTemplateToEpos(buildDiagnosticTemplate(columns), {
			printerName: 'TM & Test',
			date: 'today',
		});
		const doc = new DOMParser().parseFromString(`<epos-print>${inner}</epos-print>`, 'text/xml');
		expect(doc.querySelector('parsererror')).toBeNull();
	});
});

describe('thermalRasterToBase64', () => {
	it('packs each raster row MSB-first and pads its final byte', () => {
		const image: ThermalPixelBuffer = raster(10, 2, [
			[0, 0],
			[9, 0],
			[1, 1],
			[8, 1],
		]).image;
		expect(thermalRasterToBase64(image)).toBe('gEBAgA==');
	});
});
