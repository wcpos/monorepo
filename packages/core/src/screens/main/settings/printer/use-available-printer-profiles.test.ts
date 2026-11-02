/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { Subject } from 'rxjs';

import type { PrinterProfile } from '@wcpos/printer';

import { useAvailablePrinterProfiles } from './use-available-printer-profiles';
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
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: mockStoreDB }),
}));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => mockHttp }));

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
