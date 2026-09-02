import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { identifyDiscoveredPrinters } from '../discovery/identify';
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
	discover: async () => [discoveredPrinter],
}));
vi.mock('../discovery/star-native-discovery', () => ({ discover: async () => [] }));
vi.mock('../discovery/identify', () => ({ identifyDiscoveredPrinters: vi.fn() }));
vi.mock('../discovery/identify-probes', () => ({ createIdentifyProbes: () => ({}) }));

describe('usePrinterDiscovery (native)', () => {
	beforeEach(() => vi.mocked(identifyDiscoveredPrinters).mockReset());

	it('merges identified printers from a completed scan', async () => {
		vi.mocked(identifyDiscoveredPrinters).mockResolvedValue([{ ...discoveredPrinter, port: 443 }]);
		const { result } = renderHook(() => usePrinterDiscovery());

		await act(async () => {
			await result.current.startScan();
		});

		expect(result.current.printers).toEqual([{ ...discoveredPrinter, port: 443 }]);
		expect(result.current.isScanning).toBe(false);
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
});
