import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { identifyDiscoveredPrinters } from '../discovery/identify';
import { usePrinterDiscovery } from './use-printer-discovery.web';

import type { DiscoveredPrinter } from '../types';

vi.mock('@point-of-sale/webbluetooth-receipt-printer', () => ({ default: class {} }));
vi.mock('@point-of-sale/webusb-receipt-printer', () => ({ default: class {} }));
vi.mock('../discovery/identify', () => ({ identifyDiscoveredPrinters: vi.fn() }));
vi.mock('../discovery/identify-probes.web', () => ({ createIdentifyProbes: () => ({}) }));
vi.mock('../utils/probe-vendor', () => ({ probeVendorEndpoint: vi.fn() }));
vi.mock('../discovery/network-sweep', () => ({
	buildSweepCandidates: () => ['192.168.1.50'],
	sweepForPrinters: async () => [discoveredPrinter],
}));

const discoveredPrinter: DiscoveredPrinter = {
	id: 'net-1',
	name: 'Kitchen printer',
	connectionType: 'network',
	address: '192.168.1.50',
	port: 9100,
	vendor: 'generic',
};

describe('usePrinterDiscovery (web)', () => {
	beforeEach(() => vi.mocked(identifyDiscoveredPrinters).mockReset());

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
			finishIdentification([discoveredPrinter]);
			await scan;
		});

		expect(result.current.printers).toEqual([]);
		expect(result.current.isScanning).toBe(false);
	});
});
