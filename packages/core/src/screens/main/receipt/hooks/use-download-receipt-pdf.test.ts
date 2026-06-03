/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

const mockHttpGet = jest.fn();
const mockSaveOrSharePdf = jest.fn();
const mockLoggerSuccess = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../utils/save-or-share-pdf', () => ({
	saveOrSharePdf: (...args: unknown[]) => mockSaveOrSharePdf(...args),
}));

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({
		get: mockHttpGet,
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		success: (...args: unknown[]) => mockLoggerSuccess(...args),
		error: (...args: unknown[]) => mockLoggerError(...args),
	}),
}));

// Import after jest.mock() declarations so the module-level logger captures the mocked logger.

const { useDownloadReceiptPdf } =
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	require('./use-download-receipt-pdf') as typeof import('./use-download-receipt-pdf');

describe('useDownloadReceiptPdf', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('downloads the selected receipt PDF and saves it with the receipt filename', async () => {
		const pdfBody = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
		mockHttpGet.mockResolvedValue({ data: pdfBody });
		mockSaveOrSharePdf.mockResolvedValue(undefined);

		const { result } = renderHook(() => useDownloadReceiptPdf());

		await act(async () => {
			await result.current.download({ orderId: 42, templateId: 'template-1' });
		});

		expect(mockHttpGet).toHaveBeenCalledWith('/receipts/42/pdf', {
			params: { template_id: 'template-1' },
			responseType: 'arraybuffer',
		});
		expect(mockSaveOrSharePdf).toHaveBeenCalledWith(pdfBody, 'receipt-42.pdf');
		expect(mockLoggerSuccess).toHaveBeenCalledWith('PDF downloaded', {
			showToast: true,
			saveToDb: true,
			context: { orderId: 42, templateId: 'template-1' },
		});
		expect(result.current.isDownloading).toBe(false);
	});

	it('exposes loading state while the PDF request is in flight', async () => {
		let resolveRequest: (value: { data: ArrayBuffer }) => void = () => {};
		const pdfBody = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
		mockHttpGet.mockReturnValue(
			new Promise<{ data: ArrayBuffer }>((resolve) => {
				resolveRequest = resolve;
			})
		);
		mockSaveOrSharePdf.mockResolvedValue(undefined);

		const { result } = renderHook(() => useDownloadReceiptPdf());
		let promise: Promise<void>;

		act(() => {
			promise = result.current.download({ orderId: 42, templateId: 7 });
		});

		await waitFor(() => expect(result.current.isDownloading).toBe(true));

		await act(async () => {
			resolveRequest({ data: pdfBody });
			await promise;
		});

		expect(mockSaveOrSharePdf).toHaveBeenCalledWith(pdfBody, 'receipt-42.pdf');
		expect(result.current.isDownloading).toBe(false);
	});

	it('does not request a PDF without both an order id and template id', async () => {
		const { result } = renderHook(() => useDownloadReceiptPdf());

		await act(async () => {
			await result.current.download({
				orderId: undefined,
				templateId: 'template-1',
			});
			await result.current.download({ orderId: 42, templateId: undefined });
		});

		expect(mockHttpGet).not.toHaveBeenCalled();
		expect(mockSaveOrSharePdf).not.toHaveBeenCalled();
	});

	it('logs failed downloads and clears loading state', async () => {
		mockHttpGet.mockRejectedValue(new Error('Network down'));

		const { result } = renderHook(() => useDownloadReceiptPdf());

		await act(async () => {
			await result.current.download({ orderId: 42, templateId: 'template-1' });
		});

		expect(mockLoggerError).toHaveBeenCalledWith('Failed to download receipt PDF', {
			showToast: true,
			saveToDb: true,
			context: expect.objectContaining({
				orderId: 42,
				templateId: 'template-1',
				error: 'Network down',
			}),
		});
		expect(result.current.isDownloading).toBe(false);
	});
});
