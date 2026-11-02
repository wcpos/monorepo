/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { useCustomerDisplayService } from './use-customer-display-service';

const mockConfigure = jest.fn();
const mockStop = jest.fn();
const mockService = { configure: mockConfigure, stop: mockStop };
let mockCurrentService: typeof mockService | null = null;
const mockStopCustomerDisplayService = jest.fn(() => {
	mockCurrentService?.stop();
	mockCurrentService = null;
});
const mockStart = jest.fn((_options: unknown) => {
	mockCurrentService = mockService;
	return mockService;
});
const mockGetDeviceId = jest.fn(async () => 'device-1');

jest.mock('../../../../services/customer-display', () => ({
	getCustomerDisplayService: () => mockCurrentService,
	getDeviceId: () => mockGetDeviceId(),
	isSupportedDisplayAdvertisement: (
		display: { contract?: unknown; signaling?: unknown } | undefined
	) =>
		display?.contract === 1 &&
		typeof display.signaling === 'string' &&
		display.signaling.startsWith('/wcpos/v2/'),
	startCustomerDisplayService: (options: unknown) => mockStart(options),
	stopCustomerDisplayService: () => mockStopCustomerDisplayService(),
}));

const mockLoggerWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => ({ warn: (...args: unknown[]) => mockLoggerWarn(...args) }),
}));

const mockGet = jest.fn(async () => ({ data: [] }));
const mockPost = jest.fn(async () => ({ data: {} }));
const mockDelete = jest.fn(async () => ({ data: {} }));
let mockHttpClient = { get: mockGet, post: mockPost, delete: mockDelete };

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => mockHttpClient,
}));

let mockStore: Record<string, unknown>;
let mockSite: Record<string, unknown>;
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: mockStore, site: mockSite }),
}));

jest.mock('@wcpos/query', () => ({
	useDocField: (document: Record<string, unknown>, select: (value: any) => unknown) =>
		document ? select(document) : undefined,
}));

const flushEffects = async () => {
	await act(async () => {
		await Promise.resolve();
	});
};

beforeEach(() => {
	jest.clearAllMocks();
	mockHttpClient = { get: mockGet, post: mockPost, delete: mockDelete };
	mockCurrentService = null;
	mockSite = { localID: 'site-1' };
	mockStore = {
		localID: 'store-1',
		id: 7,
		name: 'Main Street',
		currency: 'EUR',
		locale: 'de_DE',
		timezone: 'Europe/Berlin',
		tax_display_cart: 'incl',
		prices_include_tax: 'yes',
		receipt_i18n: { total: 'Summe' },
		display: { contract: 1, signaling: '/wcpos/v2/display' },
	};
});

test('starts for an advertised store and stops when the advertisement disappears', async () => {
	const { rerender } = renderHook(() => useCustomerDisplayService());
	await flushEffects();

	expect(mockStart).toHaveBeenCalledWith(
		expect.objectContaining({ deviceId: 'device-1', storeId: 7, siteRestRoot: 'display' })
	);

	mockStore = { ...mockStore, display: undefined };
	rerender();

	expect(mockStop).toHaveBeenCalledTimes(1);
	expect(mockStopCustomerDisplayService).toHaveBeenCalledTimes(1);
});

test('adapts the REST client to the service HttpFunction contract', async () => {
	renderHook(() => useCustomerDisplayService());
	await flushEffects();
	const { http } = mockStart.mock.calls[0][0] as { http: (request: any) => Promise<unknown> };

	await http({ method: 'GET', url: 'displays', params: { device_id: 'device-1' } });
	await http({ method: 'POST', url: 'pairings', data: { store_id: 7 } });
	await http({ method: 'DELETE', url: 'displays/1' });

	expect(mockGet).toHaveBeenCalledWith('displays', { params: { device_id: 'device-1' } });
	expect(mockPost).toHaveBeenCalledWith('pairings', { store_id: 7 });
	expect(mockDelete).toHaveBeenCalledWith('displays/1');
});

test('keeps the service running and uses the latest REST client instance', async () => {
	const { rerender } = renderHook(() => useCustomerDisplayService());
	await flushEffects();
	const { http } = mockStart.mock.calls[0][0] as { http: (request: any) => Promise<unknown> };
	const nextGet = jest.fn(async () => ({ data: [] }));
	mockHttpClient = { get: nextGet, post: mockPost, delete: mockDelete };

	rerender();
	await flushEffects();
	await http({ method: 'GET', url: 'displays' });

	expect(mockStart).toHaveBeenCalledTimes(1);
	expect(mockStopCustomerDisplayService).not.toHaveBeenCalled();
	expect(nextGet).toHaveBeenCalledWith('displays', { params: undefined });
});

test('does not restart when an emission changes only display metadata', async () => {
	const { rerender } = renderHook(() => useCustomerDisplayService());
	await flushEffects();

	mockStore.name = 'Second Counter';
	mockStore.display = { contract: 1, signaling: '/wcpos/v2/display' };
	rerender();
	await flushEffects();

	expect(mockStart).toHaveBeenCalledTimes(1);
	expect(mockStopCustomerDisplayService).not.toHaveBeenCalled();
});

test("keeps an old service's HTTP client bound after a store switch", async () => {
	const { rerender } = renderHook(() => useCustomerDisplayService());
	await flushEffects();
	const { http: oldHttp } = mockStart.mock.calls[0][0] as {
		http: (request: any) => Promise<unknown>;
	};
	const nextGet = jest.fn(async () => ({ data: [] }));
	mockHttpClient = { get: nextGet, post: mockPost, delete: mockDelete };
	mockStore = { ...mockStore, localID: 'store-2', id: 8 };

	rerender();
	await flushEffects();
	await oldHttp({ method: 'GET', url: 'displays' });

	expect(mockGet).toHaveBeenCalledWith('displays', { params: undefined });
	expect(nextGet).not.toHaveBeenCalled();
});

test('configures and reconfigures from reactive store receipt fields', async () => {
	const { rerender } = renderHook(() => useCustomerDisplayService());
	await flushEffects();

	expect(mockConfigure).toHaveBeenLastCalledWith({
		store: {
			id: 7,
			name: 'Main Street',
			currency: 'EUR',
			locale: 'de_DE',
			timezone: 'Europe/Berlin',
		},
		presentation_hints: {
			display_tax: 'incl',
			prices_entered_with_tax: true,
			rounding_mode: 'round',
			locale: 'de_DE',
		},
		i18n: { total: 'Summe' },
	});

	mockStore = { ...mockStore, tax_display_cart: 'excl', prices_include_tax: 'no' };
	rerender();
	await flushEffects();

	expect(mockConfigure).toHaveBeenLastCalledWith(
		expect.objectContaining({
			presentation_hints: expect.objectContaining({
				display_tax: 'excl',
				prices_entered_with_tax: false,
			}),
		})
	);
});

test('does not start for a signaling path outside the WCPOS v2 API root', async () => {
	mockStore = { ...mockStore, display: { contract: 1, signaling: '/wp-json/display' } };
	renderHook(() => useCustomerDisplayService());
	await flushEffects();

	expect(mockStart).not.toHaveBeenCalled();
	expect(mockLoggerWarn).toHaveBeenCalledWith('Unsupported customer display advertisement', {
		context: { contract: 1 },
	});
});

test('silently ignores a store without a display advertisement', async () => {
	const { display: _display, ...storeWithoutDisplay } = mockStore;
	mockStore = storeWithoutDisplay;
	renderHook(() => useCustomerDisplayService());
	await flushEffects();

	expect(mockStart).not.toHaveBeenCalled();
	expect(mockLoggerWarn).not.toHaveBeenCalled();
});

test('does not start for an unsupported advertised contract', async () => {
	mockStore = { ...mockStore, display: { contract: 2, signaling: '/wcpos/v2/display' } };
	renderHook(() => useCustomerDisplayService());
	await flushEffects();

	expect(mockStart).not.toHaveBeenCalled();
	expect(mockLoggerWarn).toHaveBeenCalledWith('Unsupported customer display advertisement', {
		context: { contract: 2 },
	});
});

test('cleanup does not stop a newer singleton service', async () => {
	const view = renderHook(() => useCustomerDisplayService());
	await flushEffects();
	mockCurrentService = { configure: jest.fn(), stop: jest.fn() };

	view.unmount();

	expect(mockStopCustomerDisplayService).not.toHaveBeenCalled();
});

test('keeps a started service when the initial configure throws', async () => {
	mockConfigure.mockImplementationOnce(() => {
		throw new Error('config boom');
	});
	renderHook(() => useCustomerDisplayService());
	await flushEffects();

	expect(mockStart).toHaveBeenCalledTimes(1);
	expect(mockStopCustomerDisplayService).not.toHaveBeenCalled();
	expect(mockLoggerWarn).toHaveBeenCalledWith('Customer display initial config failed', {
		context: { error: 'config boom' },
	});
});
