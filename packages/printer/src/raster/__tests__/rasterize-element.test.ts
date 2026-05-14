import {
	normalizeRasterCaptureSize,
	stripThermalControlNodesForRaster,
} from '../rasterize-element';

describe('rasterize-element (ported)', () => {
	it('rounds raster width down to a multiple of 8 and pads height to a multiple of 8', () => {
		const size = normalizeRasterCaptureSize({ width: 300, height: 100, maxWidth: 570 });
		expect(size.width % 8).toBe(0);
		expect(size.height % 8).toBe(0);
		expect(size.width).toBeLessThanOrEqual(570);
	});

	it('strips trailing cut/feed/drawer nodes from a thermal template', () => {
		const stripped = stripThermalControlNodesForRaster('<receipt><text>hi</text><cut /></receipt>');
		expect(stripped).not.toContain('<cut');
		expect(stripped).toContain('<text>hi</text>');
	});
});
