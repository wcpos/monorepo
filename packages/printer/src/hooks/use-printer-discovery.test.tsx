import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { discover as discoverBle } from '../discovery/ble-native-discovery';
import { discover as discoverEpson } from '../discovery/epson-native-discovery';
import { identifyDiscoveredPrinters } from '../discovery/identify';
import { discover as discoverStar } from '../discovery/star-native-discovery';
import { usePrinterDiscovery } from './use-printer-discovery';

import type { DiscoveredPrinter } from '../types';

const discoveredPrinter: DiscoveredPrinter = {
	id: 'epson-192.168.1.30',
	name: 'EPSON TM-m30III',
	connectionType: 'network',
	address: '192.168.1.30',
	port: 9100,
	vendor: 'epson',
};

vi.mock('../discovery/epson-native-discovery', () => ({
	discover: vi.fn(),
}));
vi.mock('../discovery/star-native-discovery', () => ({ discover: vi.fn() }));
vi.mock('../discovery/ble-native-discovery', () => ({ discover: vi.fn() }));
vi.mock('../discovery/identify', () => ({ identifyDiscoveredPrinters: vi.fn() }));
vi.mock('../discovery/identify-probes', () => ({ createIdentifyProbes: () => ({}) }));

describe('usePrinterDiscovery (native)', () => {
	beforeEach(() => {
		vi.mocked(discoverEpson).mockReset().mockResolvedValue([discoveredPrinter]);
		vi.mocked(discoverStar).mockReset().mockResolvedValue([]);
		vi.mocked(discoverBle).mockReset().mockResolvedValue([]);
		vi.mocked(identifyDiscoveredPrinters).mockReset();
	});

	it('merges identified printers from a completed scan', async () => {
		vi.mocked(identifyDiscoveredPrinters).mockResolvedValue([{ ...discoveredPrinter, port: 443 }]);
		const { result } = renderHook(() => usePrinterDiscovery());

		await act(async () => {
			await result.current.startScan();
		});

		expect(result.current.printers).toEqual([{ ...discoveredPrinter, port: 443 }]);
		expect(result.current.isScanning).toBe(false);
	});

	it('lists generic BLE printers alongside the vendor SDK rows', async () => {
		const bleRow: DiscoveredPrinter = {
			id: 'ble-aa:11',
			name: 'NT-1809',
			connectionType: 'bluetooth',
			address: 'ble:aa:11',
			vendor: 'generic',
		};
		vi.mocked(discoverEpson).mockResolvedValue([]);
		vi.mocked(discoverBle).mockResolvedValue([bleRow]);
		vi.mocked(identifyDiscoveredPrinters).mockResolvedValue([bleRow]);
		const { result } = renderHook(() => usePrinterDiscovery());

		await act(async () => {
			await result.current.startScan();
		});

		expect(result.current.printers).toEqual([bleRow]);
		expect(result.current.error).toBeNull();
	});

	it('does not merge identification results after the scan is stopped', async () => {
		let finishIdentification!: (printers: DiscoveredPrinter[]) => void;
		vi.mocked(identifyDiscoveredPrinters).mockReturnValue(
			new Promise((resolve) => {
				finishIdentification = resolve;
			})
		);
		const { result } = renderHook(() => usePrinterDiscovery());
		let scan!: Promise<void>;

		await act(async () => {
			scan = result.current.startScan();
			await vi.waitFor(() => expect(identifyDiscoveredPrinters).toHaveBeenCalledOnce());
		});
		act(() => result.current.stopScan());
		await act(async () => {
			finishIdentification([{ ...discoveredPrinter, port: 443 }]);
			await scan;
		});

		expect(result.current.printers).toEqual([]);
		expect(result.current.isScanning).toBe(false);
	});

	it('does not start identification after the scan is stopped during discovery', async () => {
		let finishDiscovery!: (printers: DiscoveredPrinter[]) => void;
		vi.mocked(discoverEpson).mockReturnValueOnce(
			new Promise((resolve) => {
				finishDiscovery = resolve;
			})
		);
		const { result } = renderHook(() => usePrinterDiscovery());
		let scan!: Promise<void>;

		act(() => {
			scan = result.current.startScan();
		});
		act(() => result.current.stopScan());
		await act(async () => {
			finishDiscovery([discoveredPrinter]);
			await scan;
		});

		expect(identifyDiscoveredPrinters).not.toHaveBeenCalled();
		expect(result.current.isScanning).toBe(false);
	});
});
