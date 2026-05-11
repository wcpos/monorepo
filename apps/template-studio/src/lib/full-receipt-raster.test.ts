import { describe, expect, it } from 'vitest';

import {
	normalizeRasterCaptureSize,
	rasterizeReceiptElement,
	stripThermalControlNodesForRaster,
} from './full-receipt-raster';

describe('full receipt raster helpers', () => {
	it('scales receipt capture width to the printer dot budget and pads height', () => {
		expect(normalizeRasterCaptureSize({ width: 720, height: 125, maxWidth: 576 })).toEqual({
			width: 576,
			height: 104,
		});
	});

	it('rejects when the receipt preview node is missing', async () => {
		await expect(rasterizeReceiptElement({ receiptNode: null, maxWidth: 576 })).rejects.toThrow(
			'Receipt preview is not ready for raster printing.'
		);
	});

	it('strips only trailing thermal control nodes from full-receipt raster captures', () => {
		expect(
			stripThermalControlNodesForRaster(
				'<receipt><text>Before</text><feed lines="2" /><text>After</text><feed lines="1" /><cut type="full"></cut><drawer /></receipt>'
			)
		).toBe('<receipt><text>Before</text><feed lines="2"/><text>After</text></receipt>');
	});
});
