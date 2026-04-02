import { resolvePriceNumDecimals } from './resolve-price-num-decimals';

describe('resolvePriceNumDecimals', () => {
	it('prefers the provider decimal setting when present', () => {
		expect(resolvePriceNumDecimals({ contextDp: 3, storeDp: 2 })).toBe(3);
	});

	it('falls back to the store wc_price_decimals when provider context is absent', () => {
		expect(resolvePriceNumDecimals({ contextDp: undefined, storeDp: 0 })).toBe(0);
		expect(resolvePriceNumDecimals({ contextDp: undefined, storeDp: 3 })).toBe(3);
	});

	it('defaults to 2 when neither source is available', () => {
		expect(resolvePriceNumDecimals({ contextDp: undefined, storeDp: undefined })).toBe(2);
	});
});
