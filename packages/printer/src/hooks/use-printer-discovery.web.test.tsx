import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildSweepCandidates } from '../discovery/network-sweep';
import { probeVendorEndpoint } from '../utils/probe-vendor';
import { identifyDiscoveredPrinters } from '../discovery/identify';
import { usePrinterDiscovery } from './use-printer-discovery.web';

import type { DiscoveredPrinter } from '../types';

vi.mock('@point-of-sale/webbluetooth-receipt-printer', () => ({ default: class {} }));
vi.mock('@point-of-sale/webusb-receipt-printer', () => ({ default: class {} }));
vi.mock('../discovery/identify', () => ({ identifyDiscoveredPrinters: vi.fn() }));
vi.mock('../discovery/identify-probes.web', () => ({ createIdentifyProbes: () => ({}) }));
vi.mock('../utils/probe-vendor', () => ({ probeVendorEndpoint: vi.fn() }));
vi.mock('../logger', () => ({ printerLogger: { debug: vi.fn() } }));

const discoveredPrinter: DiscoveredPrinter = {
	id: 'net-1',
	name: 'Kitchen printer',
	connectionType: 'network',
	address: '192.168.1.50',
	port: 9100,
	vendor: 'generic',
};

describe('usePrinterDiscovery (web)', () => {
	beforeEach(() => {
		vi.mocked(identifyDiscoveredPrinters)
			.mockReset()
			.mockImplementation(async (printers) => printers);
		vi.mocked(probeVendorEndpoint).mockImplementation(async (host) =>
			host === '192.168.1.131'
				? { vendor: 'epson' as const, port: 8008, protocol: 'http' as const, status: 405 }
				: null
		);
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			if (String(url) === 'http://192.168.1.1/') return new Response();
			throw new DOMException('', 'TimeoutError');
		});
	});
	afterEach(() => vi.restoreAllMocks());

	it('finds a printer at .131 in the detected /24 and reports expanded progress', async () => {
		const { result } = renderHook(() => usePrinterDiscovery());
		await act(async () => result.current.startScan());
		expect(result.current.printers).toEqual([
			expect.objectContaining({ address: '192.168.1.131' }),
		]);
		expect(result.current.scanCandidates).toHaveLength(312);
		expect(result.current.scanProgress).toEqual({ tested: 312, total: 312 });
	});

	it('falls back to common candidates when no gateway answers', async () => {
		vi.mocked(fetch).mockRejectedValue(new DOMException('', 'TimeoutError'));
		const { result } = renderHook(() => usePrinterDiscovery());
		await act(async () => result.current.startScan());
		expect(result.current.scanCandidates).toEqual(buildSweepCandidates());
		expect(result.current.scanCandidates).not.toContain('192.168.1.131');
		expect(result.current.error).toEqual({ code: 'network-none-found' });
	});

	it('does not start the sweep after cancellation during gateway detection', async () => {
		vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
		vi.mocked(probeVendorEndpoint).mockClear();
		const { result } = renderHook(() => usePrinterDiscovery());
		let scan!: Promise<void>;
		await act(async () => {
			scan = result.current.startScan();
			await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
		});
		act(() => result.current.stopScan());
		await act(async () => scan);
		expect(probeVendorEndpoint).not.toHaveBeenCalled();
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
			finishIdentification([discoveredPrinter]);
			await scan;
		});

		expect(result.current.printers).toEqual([]);
		expect(result.current.isScanning).toBe(false);
	});
});
