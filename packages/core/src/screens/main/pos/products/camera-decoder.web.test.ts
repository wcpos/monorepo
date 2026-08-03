import { setZXingModuleOverrides } from 'barcode-detector/pure';
import { Asset } from 'expo-asset';

import { createBarcodeDetector } from './camera-decoder.web';

jest.mock('expo-asset', () => ({
	Asset: { fromModule: jest.fn(() => ({ uri: '/assets/zxing_reader.wasm' })) },
}));
jest.mock('barcode-detector/pure', () => ({
	BarcodeDetector: jest.fn(),
	setZXingModuleOverrides: jest.fn(),
}));
jest.mock('zxing-wasm/dist/reader/zxing_reader.wasm', () => 17, { virtual: true });

describe('createBarcodeDetector', () => {
	it('resolves a numeric Metro asset ID before configuring ZXing', () => {
		createBarcodeDetector(['ean_13']);

		expect(Asset.fromModule).toHaveBeenCalledWith(17);
		expect(setZXingModuleOverrides).toHaveBeenCalledTimes(1);
		const overrides = jest.mocked(setZXingModuleOverrides).mock.calls[0]?.[0] as {
			locateFile: (path: string, prefix: string) => string;
		};
		expect(overrides.locateFile('zxing_reader.wasm', '/cdn/')).toBe('/assets/zxing_reader.wasm');
		expect(overrides.locateFile('support.js', '/cdn/')).toBe('/cdn/support.js');
	});
});
