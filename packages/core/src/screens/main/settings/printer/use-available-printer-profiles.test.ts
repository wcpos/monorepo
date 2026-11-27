/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { Subject } from 'rxjs';

import type { PrinterProfile } from '@wcpos/printer';

import {
	__resetCloudPrintCacheForTests,
	useAvailablePrinterProfiles,
} from './use-available-printer-profiles';
import { mergeAvailablePrinterProfiles } from './available-printer-profiles';

const localPrinter: PrinterProfile = {
	id: 'local-1',
	name: 'Counter',
	connectionType: 'network',
	vendor: 'epson',
	address: '192.168.1.50',
	port: 9100,
	language: 'esc-pos',
	columns: 42,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: true,
	isBuiltIn: false,
};

describe('mergeAvailablePrinterProfiles', () => {
	it('returns local profiles, a built-in system target, and synthesized read-only cloud profiles', () => {
		const profiles = mergeAvailablePrinterProfiles([localPrinter], {
			printers: [
				{
					id: 'reg-7',
					name: 'Kitchen Cloud',
					provider: 'star-cloudprnt',
					columns: 48,
					language: 'esc-pos',
					autoCut: false,
					fullReceiptRaster: true,
				},
			],
		});

		expect(profiles.map((profile) => profile.id)).toEqual(['local-1', 'system', 'cloud:reg-7']);
		expect(profiles[2]).toMatchObject({
			id: 'cloud:reg-7',
			cloudPrinterId: 'reg-7',
			cloudProvider: 'star-cloudprnt',
			connectionType: 'cloud',
			isBuiltIn: true,
			vendor: 'star',
			columns: 48,
			language: 'esc-pos',
			autoCut: false,
			fullReceiptRaster: true,
		});
	});

	it('does not duplicate an already-present system target', () => {
		const systemPrinter: PrinterProfile = {
			...localPrinter,
			id: 'system',
			name: 'Print Dialog',
			connectionType: 'system',
			isBuiltIn: true,
		};

		const profiles = mergeAvailablePrinterProfiles([systemPrinter], []);

		expect(profiles.filter((profile) => profile.id === 'system')).toHaveLength(1);
	});

	it('normalizes the legacy built-in system target into the current system target', () => {
		const legacySystemPrinter: PrinterProfile = {
			...localPrinter,
			id: '__system__',
			name: 'Print Dialog',
			connectionType: 'system',
			isDefault: true,
			isBuiltIn: true,
		};

		const profiles = mergeAvailablePrinterProfiles([legacySystemPrinter], []);

		expect(profiles.map((profile) => profile.id)).toEqual(['system']);
		expect(profiles[0]).toMatchObject({
			id: 'system',
			connectionType: 'system',
			isDefault: true,
			isBuiltIn: true,
		});
	});

	it('normalizes a single cloud printer payload object to an array', () => {
		const profiles = mergeAvailablePrinterProfiles([localPrinter], {
			printers: {
				id: 'reg-8',
				name: 'Back Bar Cloud',
			},
		});

		expect(profiles.map((profile) => profile.id)).toEqual(['local-1', 'system', 'cloud:reg-8']);
	});

	it('normalizes keyed cloud printer payload objects returned by persisted server settings', () => {
		const profiles = mergeAvailablePrinterProfiles([localPrinter], {
			printers: {
				'reg-9': {
					name: 'Kitchen Cloud',
				},
				'reg-10': {
					name: 'Bar Cloud',
				},
			},
		});

		expect(profiles.map((profile) => profile.id)).toEqual([
			'local-1',
			'system',
			'cloud:reg-9',
			'cloud:reg-10',
		]);
	});
});

const mockProfiles$ = new Subject<PrinterProfile[]>();
const mockStoreDB = {};
const mockObservePrinterProfiles = jest.fn((_database: unknown) => mockProfiles$);
jest.mock('@wcpos/query', () => ({
	observePrinterProfiles: (database: unknown) => mockObservePrinterProfiles(database),
}));
// The cloud request settles immediately so the loading state is driven by the local query.
const settledAtOnce = (): Promise<unknown> => Promise.resolve({ data: null });
const mockHttp = { get: jest.fn(settledAtOnce) };
// A copy shares the same `get` mock but is a new client object, as after an online-status flip.
let mockHttpClient = mockHttp;
let mockStoreId = 1;
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		storeDB: mockStoreDB,
		site: { wp_api_url: 'https://shop.test/wp-json/' },
		store: { id: mockStoreId },
	}),
}));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => mockHttpClient }));

beforeEach(() => {
	__resetCloudPrintCacheForTests();
	mockHttp.get.mockClear();
	mockHttpClient = mockHttp;
	mockStoreId = 1;
});

it.each<[PrinterProfile[]]>([[[]], [[localPrinter]]])(
	'waits for the first local emission: %j',
	async (profiles) => {
		const { result } = renderHook(() => useAvailablePrinterProfiles());
		expect(result.current.isLoading).toBe(true);
		expect(result.current.printers.map((p) => p.id)).toEqual(['system']);
		// Flush the settled cloud request and the local emission together.
		await act(async () => {
			mockProfiles$.next(profiles);
		});
		expect(result.current.isLoading).toBe(false);
		expect(result.current.printers.map((p) => p.id)).toEqual(
			profiles.length ? ['local-1', 'system'] : ['system']
		);
	}
);

it('renders profile rows from the named read', async () => {
	const { result } = renderHook(() => useAvailablePrinterProfiles());
	await act(async () => {
		mockProfiles$.next([localPrinter]);
	});
	expect(result.current.printers.map((p) => p.id)).toEqual(['local-1', 'system']);
	expect(mockObservePrinterProfiles).toHaveBeenCalledWith(mockStoreDB);
});

describe('cloudPending', () => {
	let settle: { resolve: (value: unknown) => void; reject: (error: unknown) => void };

	beforeEach(() => {
		jest.useFakeTimers();
		mockHttp.get.mockImplementation(
			() =>
				new Promise((resolve, reject) => {
					settle = { resolve, reject };
				})
		);
	});
	afterEach(() => {
		jest.useRealTimers();
		mockHttp.get.mockImplementation(settledAtOnce);
	});

	it('stays true past the grace while the request hangs, then clears when it answers', async () => {
		const { result } = renderHook(() => useAvailablePrinterProfiles());
		await act(async () => {
			mockProfiles$.next([localPrinter]);
		});
		expect(result.current.cloudPending).toBe(true);

		act(() => {
			jest.advanceTimersByTime(2000);
		});
		// The list stops waiting; routing still knows the cloud answer is outstanding.
		expect(result.current.isLoading).toBe(false);
		expect(result.current.cloudPending).toBe(true);

		await act(async () => {
			settle.resolve({ data: [{ id: 'reg-7', name: 'Kitchen Cloud' }] });
		});
		expect(result.current.cloudPending).toBe(false);
		expect(result.current.printers.map((p) => p.id)).toContain('cloud:reg-7');
	});

	it('clears when the request fails', async () => {
		const { result } = renderHook(() => useAvailablePrinterProfiles());
		await act(async () => {
			mockProfiles$.next([localPrinter]);
		});
		expect(result.current.cloudPending).toBe(true);

		await act(async () => {
			settle.reject(new Error('offline'));
		});
		expect(result.current.cloudPending).toBe(false);
		expect(result.current.isLoading).toBe(false);
	});
});

describe('one cloud-print answer per store session', () => {
	// Mirrors CLOUD_PRINT_MAX_AGE_MS in the hook.
	const MAX_AGE_MS = 10 * 60_000;
	type Settle = { resolve: (value: unknown) => void; reject: (error: unknown) => void };
	let gets: Settle[];
	const answer = (id: string) => ({ data: [{ id, name: id }] });
	const cloudIds = (current: { printers: PrinterProfile[] }) =>
		current.printers.filter((p) => p.id.startsWith('cloud:')).map((p) => p.id);
	const mount = (options?: { refresh?: boolean }) =>
		renderHook(() => useAvailablePrinterProfiles(options));
	// Lets the shared request's then/catch/finally chain run to the end.
	const flush = () =>
		act(async () => {
			for (let i = 0; i < 10; i += 1) await Promise.resolve();
		});
	const resolveGet = async (index: number, value: unknown) => {
		gets[index].resolve(value);
		await flush();
	};
	const rejectGet = async (index: number) => {
		gets[index].reject(new Error('offline'));
		await flush();
	};
	const advance = (ms: number) =>
		act(() => {
			jest.advanceTimersByTime(ms);
		});

	beforeEach(() => {
		jest.useFakeTimers();
		gets = [];
		mockHttp.get.mockImplementation(
			() =>
				new Promise((resolve, reject) => {
					gets.push({ resolve, reject });
				})
		);
	});
	afterEach(() => {
		jest.useRealTimers();
		mockHttp.get.mockImplementation(settledAtOnce);
	});

	it('P1: two consumers, a remount and a new http client make exactly 1 GET', async () => {
		const first = mount();
		const second = mount();
		await resolveGet(0, answer('reg-1'));
		first.unmount();
		second.unmount();
		const again = mount();
		expect(cloudIds(again.result.current)).toEqual(['cloud:reg-1']);
		// Even with the answer due for a refetch, a new client object alone never starts one.
		advance(MAX_AGE_MS);
		mockHttpClient = { ...mockHttp };
		again.rerender();
		await flush();
		expect(mockHttp.get).toHaveBeenCalledTimes(1);
	});

	it('P2: a failed GET is not cached; the next mount retries and every consumer sees it', async () => {
		const failed = mount();
		await rejectGet(0);
		expect(failed.result.current.cloudPending).toBe(false);
		expect(cloudIds(failed.result.current)).toEqual([]);

		const retry = mount();
		const sharing = mount();
		expect(mockHttp.get).toHaveBeenCalledTimes(2);
		expect(retry.result.current.cloudPending).toBe(true);
		await resolveGet(1, answer('reg-2'));
		expect(cloudIds(retry.result.current)).toEqual(['cloud:reg-2']);
		expect(cloudIds(sharing.result.current)).toEqual(['cloud:reg-2']);
		expect(cloudIds(failed.result.current)).toEqual(['cloud:reg-2']);
		expect(mockHttp.get).toHaveBeenCalledTimes(2);
	});

	it('P3: a refresh mount refetches a fresh answer and the mounted consumer gets the new one', async () => {
		const mounted = mount();
		await resolveGet(0, answer('reg-old'));

		const settings = mount({ refresh: true });
		expect(mockHttp.get).toHaveBeenCalledTimes(2);
		// The cached answer stands while the refresh runs.
		expect(cloudIds(settings.result.current)).toEqual(['cloud:reg-old']);
		expect(settings.result.current.cloudPending).toBe(false);
		await resolveGet(1, answer('reg-new'));
		expect(cloudIds(mounted.result.current)).toEqual(['cloud:reg-new']);
		expect(cloudIds(settings.result.current)).toEqual(['cloud:reg-new']);
	});

	it('P4: another store issues its own GET and never sees the first store’s answer', async () => {
		const storeOne = mount();
		await resolveGet(0, answer('reg-store-1'));

		mockStoreId = 2;
		const storeTwo = mount();
		expect(mockHttp.get).toHaveBeenCalledTimes(2);
		expect(cloudIds(storeTwo.result.current)).toEqual([]);
		expect(storeTwo.result.current.cloudPending).toBe(true);
		await resolveGet(1, answer('reg-store-2'));
		expect(cloudIds(storeTwo.result.current)).toEqual(['cloud:reg-store-2']);
		expect(cloudIds(storeOne.result.current)).toEqual(['cloud:reg-store-1']);
	});

	it('P5: refetches once in the background at max age and keeps the old answer on failure', async () => {
		mount();
		await resolveGet(0, answer('reg-1'));

		advance(MAX_AGE_MS - 1);
		mount();
		expect(mockHttp.get).toHaveBeenCalledTimes(1);

		advance(1);
		const stale = mount();
		expect(cloudIds(stale.result.current)).toEqual(['cloud:reg-1']);
		expect(stale.result.current.cloudPending).toBe(false);
		expect(mockHttp.get).toHaveBeenCalledTimes(2);

		mount();
		expect(mockHttp.get).toHaveBeenCalledTimes(2);

		await rejectGet(1);
		expect(cloudIds(stale.result.current)).toEqual(['cloud:reg-1']);

		const after = mount();
		expect(cloudIds(after.result.current)).toEqual(['cloud:reg-1']);
		expect(mockHttp.get).toHaveBeenCalledTimes(3);
	});

	it('P6: ten sales inside ten minutes, with one http client change, make 1 GET', async () => {
		for (let sale = 0; sale < 10; sale += 1) {
			const receipt = mount();
			if (sale === 0) await resolveGet(0, answer('reg-1'));
			if (sale === 5) {
				mockHttpClient = { ...mockHttp };
				receipt.rerender();
			}
			await flush();
			receipt.unmount();
			advance(50_000);
		}
		const n = mockHttp.get.mock.calls.length;
		console.info('P6 GETs', n);
		expect(n).toBe(1);
	});
});
