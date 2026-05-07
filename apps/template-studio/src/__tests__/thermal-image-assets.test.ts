import { describe, expect, it } from 'vitest';

import {
	isSupportedThermalLogoSrc,
	maxDotsForPaperWidth,
	normalizeThermalImageSize,
} from '../lib/thermal-image-assets';

describe('thermal image assets', () => {
	it('accepts png and jpeg data image sources', () => {
		expect(isSupportedThermalLogoSrc('data:image/png;base64,AAAA')).toBe(true);
		expect(isSupportedThermalLogoSrc('data:image/jpeg;base64,AAAA')).toBe(true);
	});

	it('rejects svg and non-image sources in v1', () => {
		expect(isSupportedThermalLogoSrc('data:image/svg+xml;base64,PHN2Zy8+')).toBe(false);
		expect(isSupportedThermalLogoSrc('javascript:alert(1)')).toBe(false);
		expect(isSupportedThermalLogoSrc('data:text/html;base64,AAAA')).toBe(false);
	});

	it('normalizes raster dimensions to multiples of 8 within printer width', () => {
		expect(normalizeThermalImageSize({ width: 577, height: 73, maxWidth: 576 })).toEqual({
			width: 576,
			height: 72,
		});
	});

	it('maps paper widths to conservative dot budgets', () => {
		expect(maxDotsForPaperWidth('58mm')).toBe(384);
		expect(maxDotsForPaperWidth('80mm')).toBe(576);
	});
});
