/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { resetCheckoutMode } from '../pos/checkout/checkout-mode';
import { useReceiptDocument } from './use-receipt-document';

const mockPrint = jest.fn<Promise<void>, []>();
let mockFinal = true;
let mockAutoPrint = true;
const order = { uuid: 'paid', payload: { id: 42 } } as never;
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('@wcpos/printer', () => ({ usePrint: () => ({ print: mockPrint, isPrinting: false }) }));
jest.mock('./hooks/use-template-renderer', () => ({
	useTemplateRenderer: () => ({
		templates: [{ id: 7 }],
		selectedTemplateId: 7,
		renderedHtml: '<html/>',
		hasFinalData: mockFinal,
	}),
}));
jest.mock('./hooks/use-resolved-printer', () => ({
	useResolvedPrinter: () => ({ resolvedPrinter: { name: 'Till printer' } }),
}));
jest.mock('./hooks/use-download-receipt-pdf', () => ({
	useDownloadReceiptPdf: () => ({ download: jest.fn() }),
}));
jest.mock('./components/receipt-preview-viewport', () => ({
	getReceiptPreviewPaperWidth: () => 80,
}));
jest.mock('../hooks/use-cloud-enqueue', () => ({ createCloudEnqueueFactory: () => jest.fn() }));
jest.mock('../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => ({}) }));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({ store: { wc_price_decimals: 2 } }),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { autoPrintReceipt: mockAutoPrint } }),
}));
jest.mock('../contexts/tax-rates/provider', () => ({ useTaxSettingsOptional: () => null }));

beforeEach(() => {
	resetCheckoutMode();
	mockPrint.mockReset().mockResolvedValue(undefined);
	mockFinal = true;
	mockAutoPrint = true;
});

it('waits for final data and frame load, then auto-prints once', async () => {
	mockFinal = false;
	const { result, rerender } = renderHook(() =>
		useReceiptDocument({ order, autoPrintAllowed: true })
	);
	await act(async () => result.current.previewProps.handleLoad());
	expect(mockPrint).not.toHaveBeenCalled();
	mockFinal = true;
	await act(async () => rerender());
	expect(mockPrint).toHaveBeenCalledTimes(1);
	expect(result.current.printedTo).toBe('Till printer');
	await act(async () => result.current.previewProps.handleLoad());
	expect(mockPrint).toHaveBeenCalledTimes(1);
});
it('waits for a frame even when final data is ready first', async () => {
	const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: true }));
	expect(mockPrint).not.toHaveBeenCalled();
	await act(async () => result.current.previewProps.handleLoad());
	expect(mockPrint).toHaveBeenCalledTimes(1);
});
it.each([false, true])(
	'does not auto-print with allowed=%s and auto-print disabled',
	async (autoPrintAllowed) => {
		mockAutoPrint = false;
		const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed }));
		await act(async () => result.current.previewProps.handleLoad());
		expect(mockPrint).not.toHaveBeenCalled();
	}
);
it('never auto-prints in a reprint host but records a successful manual print', async () => {
	const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: false }));
	await act(async () => result.current.previewProps.handleLoad());
	expect(mockPrint).not.toHaveBeenCalled();
	let resolve!: () => void;
	mockPrint.mockReturnValue(
		new Promise<void>((done) => {
			resolve = done;
		})
	);
	let printing!: Promise<void>;
	act(() => {
		printing = result.current.print();
	});
	expect(result.current.printedTo).toBeNull();
	await act(async () => {
		resolve();
		await printing;
	});
	expect(result.current.printedTo).toBe('Till printer');
});
it('does not report a failed print as printed or retry auto-print', async () => {
	mockPrint.mockRejectedValue(new Error('printer offline'));
	const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: true }));
	await act(async () => result.current.previewProps.handleLoad());
	await act(async () => result.current.previewProps.handleLoad());
	expect(result.current.printedTo).toBeNull();
	expect(mockPrint).toHaveBeenCalledTimes(1);
});

it('does not auto-print again when a paid tab is revisited', async () => {
	const first = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: true }));
	await act(async () => first.result.current.previewProps.handleLoad());
	first.unmount();
	const second = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: true }));
	await act(async () => second.result.current.previewProps.handleLoad());
	expect(mockPrint).toHaveBeenCalledTimes(1);
});

it('keeps finishing blocked until the frame settles the auto-print, not just until sync ends', async () => {
	const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: true }));
	// Final data is in and the store is not syncing, but the preview frame has not loaded:
	// New sale must still wait, or the configured print never fires.
	expect(result.current.isSyncing).toBeFalsy();
	expect(result.current.autoPrintPending).toBe(true);
	await act(async () => result.current.previewProps.handleLoad());
	expect(mockPrint).toHaveBeenCalledTimes(1);
	expect(result.current.autoPrintPending).toBe(false);
});

it('releases finishing when the frame fails to load', async () => {
	const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: true }));
	expect(result.current.autoPrintPending).toBe(true);
	await act(async () => result.current.previewProps.handleError());
	expect(result.current.autoPrintPending).toBe(false);
	expect(mockPrint).not.toHaveBeenCalled();
});

it('never blocks finishing in a host that does not auto-print', () => {
	const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: false }));
	expect(result.current.autoPrintPending).toBe(false);
});
