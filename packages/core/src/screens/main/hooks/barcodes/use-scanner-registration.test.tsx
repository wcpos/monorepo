/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { of } from 'rxjs';

import { useScannerRegistration } from './use-scanner-registration';

type WedgeKeyPayload = {
	key: string;
	deviceId: number;
	deviceName: string;
	vendorId: number;
	productId: number;
	timeMs: number;
	captured: boolean;
};

let capturedListener: ((payload: WedgeKeyPayload) => void) | undefined;
const mockSetCaptureAll = jest.fn();
const mockRemove = jest.fn();
const mockAddListener = jest.fn((_event: string, listener: (payload: WedgeKeyPayload) => void) => {
	capturedListener = listener;
	return { remove: mockRemove };
});
const mockInsert = jest.fn();

jest.mock('./use-attributed-wedge', () => ({
	wedgeKeyEventsModule: {
		setCaptureAll: (...args: unknown[]) => mockSetCaptureAll(...args),
		setCapturedDevices: jest.fn(),
		addListener: (event: string, listener: (payload: WedgeKeyPayload) => void) =>
			mockAddListener(event, listener),
	},
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			barcode_scanning_avg_time_input_threshold$: of(24),
			barcode_scanning_min_chars$: of(8),
		},
	}),
}));

jest.mock('../use-collection', () => ({
	useCollection: () => ({ collection: { insert: (...args: unknown[]) => mockInsert(...args) } }),
}));

// uuid ships ESM that ts-jest won't transform; only save() uses it (not exercised here).
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

const SCANNER = { deviceId: 5, deviceName: 'Honeywell', vendorId: 0x0c2e, productId: 0x0b61 };
const KEYBOARD = { deviceId: 7, deviceName: 'Apple Keyboard', vendorId: 0x05ac, productId: 0x024f };

function feed(
	device: { deviceId: number; deviceName: string; vendorId: number; productId: number },
	chars: string,
	gapMs: number,
	startMs = 1000
) {
	let t = startMs;
	for (const key of chars) {
		capturedListener?.({ key, timeMs: t, captured: false, ...device });
		t += gapMs;
	}
}

beforeEach(() => {
	capturedListener = undefined;
	jest.clearAllMocks();
});

describe('useScannerRegistration', () => {
	it('promotes a device that sends a fast scanner-like burst', () => {
		const { result } = renderHook(() => useScannerRegistration());
		act(() => result.current.start());
		expect(mockSetCaptureAll).toHaveBeenCalledWith(true);

		act(() => feed(SCANNER, '12345678', 8));

		expect(result.current.candidate).toEqual({
			deviceName: SCANNER.deviceName,
			vendorId: SCANNER.vendorId,
			productId: SCANNER.productId,
		});
		// Capture stops as soon as a scanner is found.
		expect(result.current.capturing).toBe(false);
		expect(mockRemove).toHaveBeenCalled();
		expect(mockSetCaptureAll).toHaveBeenLastCalledWith(false);
	});

	it('does not register an ordinary keyboard from slow human typing', () => {
		const { result } = renderHook(() => useScannerRegistration());
		act(() => result.current.start());

		act(() => feed(KEYBOARD, 'password', 150));

		expect(result.current.candidate).toBeNull();
		expect(result.current.capturing).toBe(true);
	});

	it('does not register a device from a single keypress (#739)', () => {
		const { result } = renderHook(() => useScannerRegistration());
		act(() => result.current.start());

		act(() => feed(KEYBOARD, 'x', 0));

		expect(result.current.candidate).toBeNull();
		expect(result.current.capturing).toBe(true);
	});

	it('does not register on a fast keypair followed by ordinary typing (#739 P1)', () => {
		const { result } = renderHook(() => useScannerRegistration());
		act(() => result.current.start());

		// Two quick presses latch the wedge heuristic, then six ordinary keystrokes.
		// The gap at/above threshold must end the burst so it never reaches minChars.
		act(() => {
			capturedListener?.({ key: 'a', timeMs: 1000, captured: false, ...KEYBOARD });
			capturedListener?.({ key: 'b', timeMs: 1005, captured: false, ...KEYBOARD });
			let t = 1105;
			for (const key of 'cdefgh') {
				capturedListener?.({ key, timeMs: t, captured: false, ...KEYBOARD });
				t += 100;
			}
		});

		expect(result.current.candidate).toBeNull();
		expect(result.current.capturing).toBe(true);
	});

	it('ignores the virtual keyboard even on a fast burst', () => {
		const { result } = renderHook(() => useScannerRegistration());
		act(() => result.current.start());

		act(() =>
			feed({ deviceId: 0, deviceName: 'virtual', vendorId: 0, productId: 0 }, '12345678', 8)
		);

		expect(result.current.candidate).toBeNull();
		expect(result.current.capturing).toBe(true);
	});

	it('is not fooled by slow typing interleaved across two devices', () => {
		const { result } = renderHook(() => useScannerRegistration());
		act(() => result.current.start());

		// Two keyboards each typed slowly; interleaving must not fabricate a fast
		// burst on either device (per-device wedge state).
		act(() => {
			let t = 1000;
			for (let i = 0; i < 8; i += 1) {
				capturedListener?.({ key: 'a', timeMs: t, captured: false, ...KEYBOARD });
				capturedListener?.({ key: 'b', timeMs: t + 5, captured: false, ...SCANNER });
				t += 200;
			}
		});

		expect(result.current.candidate).toBeNull();
	});
});
