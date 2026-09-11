/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';

import { resetCheckoutMode } from '../pos/checkout/checkout-mode';
import { useReceiptDocument } from './use-receipt-document';

const mockPrint = jest.fn<Promise<void>, []>();
let mockFinal = true;
let mockAutoPrint = true;
const order = { uuid: 'paid', payload: { id: 42, currency: 'USD' } } as never;
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnline ? 'online-website-available' : 'offline' }),
}));
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
jest.mock('../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => mockHttp }));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: { wc_price_decimals: 2, name: 'Shop' },
		site: { wcpos_version: 'plugin' },
	}),
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

it('starts a new order on the same hook instance unattempted and unloaded', async () => {
	const second = { uuid: 'paid-2', payload: { id: 43 } } as never;
	const { result, rerender } = renderHook(
		({ current }: { current: unknown }) =>
			useReceiptDocument({ order: current as never, autoPrintAllowed: true }),
		{ initialProps: { current: order } }
	);
	await act(async () => result.current.previewProps.handleLoad());
	expect(mockPrint).toHaveBeenCalledTimes(1);
	expect(result.current.autoPrintPending).toBe(false);

	// Same template, different order: the guards must not carry over.
	await act(async () => rerender({ current: second }));
	expect(result.current.autoPrintPending).toBe(true);
	await act(async () => result.current.previewProps.handleLoad());
	expect(mockPrint).toHaveBeenCalledTimes(2);
	expect(result.current.autoPrintPending).toBe(false);
});

const mockGet = jest.fn();
const mockHttp = { get: mockGet };
let mockOnline = true;
const mockThermalPrint = jest.fn().mockResolvedValue(undefined);
const mockHtmlPrint = jest.fn().mockResolvedValue(undefined);
const mockCloudPrint = jest.fn().mockResolvedValue(undefined);
jest.mock('./hooks/use-active-templates', () => ({
	useActiveTemplates: () => [
		{
			id: 7,
			offline_capable: true,
			engine: 'thermal',
			content:
				'<receipt><text>{{#fiscal.is_reprint}}{{i18n.copy}} {{fiscal.reprint_count}}{{/fiscal.is_reprint}}</text></receipt>',
		},
	],
}));
jest.mock('../hooks/use-order-status-label', () => ({
	useOrderStatusLabel: () => ({ getLabel: (s: string) => s }),
}));
jest.mock('../../../services/register/use-register', () => ({
	useRegister: () => ({ id: 'till-1', name: 'Front till' }),
}));
jest.mock('@wcpos/printer/raster/rasterize-provider', () => ({ useOptionalRasterize: () => null }));
jest.mock('@wcpos/printer/printer-service', () => ({
	PrinterService: jest.fn(() => ({
		setCloudEnqueueFactory: jest.fn(),
		printThermalTemplateForPrint: mockThermalPrint,
		printHtml: mockHtmlPrint,
		printOrderViaCloud: mockCloudPrint,
	})),
}));

describe('print intent through checkout and reprint receipt documents', () => {
	beforeEach(() => {
		mockOnline = true;
		mockAutoPrint = false;
		mockGet.mockReset().mockImplementation((_url, options) =>
			Promise.resolve({
				data: {
					data: {
						order: { id: 42, number: '42', currency: 'USD' },
						fiscal: {
							is_reprint: options.params.intent === 'print',
							reprint_count: options.params.intent === 'print' ? 1 : 0,
						},
					},
				},
			})
		);
		mockThermalPrint.mockClear();
		mockHtmlPrint.mockClear();
		mockCloudPrint.mockClear();
		jest
			.spyOn(jest.requireMock('./hooks/use-template-renderer'), 'useTemplateRenderer')
			.mockImplementation(jest.requireActual('./hooks/use-template-renderer').useTemplateRenderer);
		jest
			.spyOn(jest.requireMock('@wcpos/printer'), 'usePrint')
			.mockImplementation(jest.requireActual('@wcpos/printer/hooks/use-print').usePrint);
	});
	afterEach(() => {
		jest.restoreAllMocks();
		mockOnline = true;
	});

	it.each([true, false])(
		'fetches print intent and prints its returned marking (checkout=%s)',
		async (autoPrintAllowed) => {
			const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed }));
			await waitFor(() => expect(result.current.hasFinalData).toBe(true));
			expect(mockGet).toHaveBeenLastCalledWith('/receipts/42', { params: { mode: 'live' } });
			await act(async () => {
				await result.current.print();
			});
			expect(mockGet).toHaveBeenLastCalledWith('/receipts/42', {
				params: { mode: 'live', intent: 'print' },
			});
			expect(mockThermalPrint.mock.calls[0][0].fiscal).toMatchObject({
				is_reprint: true,
				reprint_count: 1,
			});
		}
	);

	it('prints fresh HTML rather than the unmarked system-dialog preview', async () => {
		jest
			.spyOn(jest.requireMock('./hooks/use-resolved-printer'), 'useResolvedPrinter')
			.mockReturnValue({ useSystemDialog: true });
		const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: false }));
		await waitFor(() => expect(result.current.hasFinalData).toBe(true));
		expect(result.current.previewProps.renderedHtml).not.toContain('COPY 1');
		await act(async () => {
			await result.current.print();
		});
		expect(mockHtmlPrint.mock.calls[0][0]).toContain('COPY 1');
	});

	it('auto-prints checkout using counted data after the frame loads', async () => {
		mockAutoPrint = true;
		const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: true }));
		await waitFor(() => expect(result.current.hasFinalData).toBe(true));
		await act(async () => {
			result.current.previewProps.handleLoad();
		});
		await waitFor(() => expect(mockThermalPrint).toHaveBeenCalledTimes(1));
		expect(mockGet).toHaveBeenLastCalledWith('/receipts/42', {
			params: { mode: 'live', intent: 'print' },
		});
	});

	it('leaves counting to the order-based cloud job rather than counting twice', async () => {
		jest
			.spyOn(jest.requireMock('./hooks/use-resolved-printer'), 'useResolvedPrinter')
			.mockReturnValue({
				resolvedPrinter: { connectionType: 'cloud', cloudProvider: 'printnode' },
			});
		const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: false }));
		await waitFor(() => expect(result.current.hasFinalData).toBe(true));
		await act(async () => {
			await result.current.print();
		});
		expect(mockCloudPrint).toHaveBeenCalledWith(
			expect.objectContaining({ cloudProvider: 'printnode' }),
			42,
			'7'
		);
		expect(mockGet.mock.calls.map(([, options]) => options.params)).toEqual([{ mode: 'live' }]);
	});

	it('preserves uncounted legacy URL printing when marked JSON cannot be rendered', async () => {
		jest
			.spyOn(jest.requireMock('./hooks/use-active-templates'), 'useActiveTemplates')
			.mockReturnValue([{ id: 7, offline_capable: false, engine: 'legacy-php' }]);
		jest
			.spyOn(jest.requireMock('./hooks/use-resolved-printer'), 'useResolvedPrinter')
			.mockReturnValue({ useSystemDialog: true });
		const legacyOrder = {
			uuid: 'legacy',
			payload: {
				id: 42,
				currency: 'USD',
				links: { receipt: [{ href: 'https://example.test/receipt' }] },
			},
		} as never;
		const { result } = renderHook(() =>
			useReceiptDocument({ order: legacyOrder, autoPrintAllowed: false })
		);
		await waitFor(() => expect(result.current.hasFinalData).toBe(true));
		const iframe = document.createElement('iframe');
		document.body.append(iframe);
		iframe.contentDocument!.body.textContent = 'Legacy receipt';
		result.current.previewProps.iframeRef.current = iframe;
		try {
			await act(async () => {
				await result.current.print();
			});
			expect(mockHtmlPrint.mock.calls[0][0]).toContain('Legacy receipt');
			expect(mockGet.mock.calls.map(([, options]) => options.params)).toEqual([{ mode: 'live' }]);
		} finally {
			iframe.remove();
		}
	});

	it.each([undefined, 42])(
		'marks a second local print across remounts (server id=%s)',
		async (id) => {
			mockOnline = false;
			let data = {
				uuid: 'offline',
				payload: { id, currency: 'USD' },
				local: { dirty: false, pendingMutationIds: [] },
			};
			const localOrder = {
				...data,
				getLatest: () => data,
				incrementalModify: async (modify: (value: typeof data) => typeof data) => {
					data = modify(data);
					return data;
				},
			} as never;
			const first = renderHook(() =>
				useReceiptDocument({ order: localOrder, autoPrintAllowed: false })
			);
			await act(async () => {
				await first.result.current.print();
			});
			expect(mockThermalPrint.mock.calls[0][0].fiscal).toMatchObject({
				is_reprint: false,
				reprint_count: 0,
			});
			first.unmount();
			const second = renderHook(() =>
				useReceiptDocument({ order: localOrder, autoPrintAllowed: false })
			);
			await act(async () => {
				await second.result.current.print();
			});
			expect(mockThermalPrint.mock.calls[1][0].fiscal).toMatchObject({
				is_reprint: true,
				reprint_count: 1,
			});
			expect(data.local).toMatchObject({
				receiptPrintCount: 2,
				dirty: false,
				pendingMutationIds: [],
			});
			expect(data.payload).not.toHaveProperty('receiptPrintCount');
			expect(mockGet.mock.calls.every(([, options]) => options.params.intent === undefined)).toBe(
				true
			);
		}
	);

	it.each([
		[undefined, 1],
		[3, 4],
	] as const)(
		'prepares offline count %s without writing, then commits the exact count',
		async (initialCount, prospective) => {
			mockOnline = false;
			let data = {
				uuid: 'offline-prepare',
				payload: { currency: 'USD' },
				local: {
					dirty: true,
					pendingMutationIds: ['pending'],
					receiptPrintCount: initialCount as number | undefined,
				},
			};
			const incrementalModify = jest.fn(async (modify: (value: typeof data) => typeof data) => {
				data = modify(data);
				return data;
			});
			const localOrder = { ...data, getLatest: () => data, incrementalModify };
			let prepare!: NonNullable<
				Parameters<typeof import('@wcpos/printer').usePrint>[0]['preparePrint']
			>;
			jest
				.spyOn(jest.requireMock<typeof import('@wcpos/printer')>('@wcpos/printer'), 'usePrint')
				.mockImplementation((options: Parameters<typeof import('@wcpos/printer').usePrint>[0]) => {
					prepare = options.preparePrint!;
					return { print: mockPrint, isPrinting: false };
				});
			renderHook(() => useReceiptDocument({ order: localOrder as never, autoPrintAllowed: false }));
			const first = await prepare();
			const second = await prepare();
			expect(incrementalModify).not.toHaveBeenCalled();
			expect(data.local.receiptPrintCount).toBe(initialCount);
			expect(first.receiptData?.fiscal).toMatchObject({ reprint_count: prospective - 1 });
			expect(second.receiptData).toEqual(first.receiptData);
			expect(second.html).toBe(first.html);
			await first.commit!();
			await first.commit!();
			expect(data.local).toEqual({
				dirty: true,
				pendingMutationIds: ['pending'],
				receiptPrintCount: prospective,
			});
			const next = await prepare();
			expect(next.receiptData?.fiscal).toMatchObject({
				is_reprint: true,
				reprint_count: prospective,
			});
			await next.commit!();
			await second.commit!();
			expect(data.local.receiptPrintCount).toBe(prospective + 1);
		}
	);

	it('does not attach a local commit to server-counted preparation', async () => {
		let prepare!: NonNullable<
			Parameters<typeof import('@wcpos/printer').usePrint>[0]['preparePrint']
		>;
		jest
			.spyOn(jest.requireMock<typeof import('@wcpos/printer')>('@wcpos/printer'), 'usePrint')
			.mockImplementation((options: Parameters<typeof import('@wcpos/printer').usePrint>[0]) => {
				prepare = options.preparePrint!;
				return { print: mockPrint, isPrinting: false };
			});
		const { result } = renderHook(() => useReceiptDocument({ order, autoPrintAllowed: false }));
		await waitFor(() => expect(result.current.hasFinalData).toBe(true));
		const prepared = await prepare();
		expect(prepared.commit).toBeUndefined();
		expect(prepared.receiptData?.fiscal).toMatchObject({ is_reprint: true, reprint_count: 1 });
	});
});
// The service boundary is mocked above; no physical encoder is needed in jsdom.
jest.mock('@point-of-sale/receipt-printer-encoder', () => jest.fn());
