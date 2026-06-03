/**
 * @jest-environment jsdom
 */
import { saveOrSharePdf } from './save-or-share-pdf';

const mockWriteAsStringAsync = jest.fn();
const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();
const mockPrintAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
	EncodingType: { Base64: 'base64' },
	cacheDirectory: 'file:///cache/',
	writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
}));

jest.mock('expo-sharing', () => ({
	isAvailableAsync: () => mockIsAvailableAsync(),
	shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

jest.mock('expo-print', () => ({
	printAsync: (...args: unknown[]) => mockPrintAsync(...args),
}));

describe('saveOrSharePdf on native platforms', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockIsAvailableAsync.mockResolvedValue(true);
	});

	it('writes PDF bytes to cache and opens the native share sheet', async () => {
		await saveOrSharePdf(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'receipt-42.pdf');

		expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
			'file:///cache/receipt-42.pdf',
			'JVBERg==',
			{
				encoding: 'base64',
			}
		);
		expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/receipt-42.pdf', {
			mimeType: 'application/pdf',
			UTI: 'com.adobe.pdf',
			dialogTitle: 'receipt-42.pdf',
		});
		expect(mockPrintAsync).not.toHaveBeenCalled();
	});

	it('falls back to the native print dialog when sharing is unavailable', async () => {
		mockIsAvailableAsync.mockResolvedValue(false);

		await saveOrSharePdf(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'receipt-42.pdf');

		expect(mockPrintAsync).toHaveBeenCalledWith({
			uri: 'file:///cache/receipt-42.pdf',
		});
		expect(mockShareAsync).not.toHaveBeenCalled();
	});
});
