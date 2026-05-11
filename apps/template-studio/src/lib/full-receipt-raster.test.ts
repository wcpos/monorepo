import { describe, expect, it } from 'vitest';

import { normalizeRasterCaptureSize, rasterizeReceiptElement } from './full-receipt-raster';

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
});
