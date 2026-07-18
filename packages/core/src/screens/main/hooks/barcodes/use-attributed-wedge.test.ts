/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import type { ScanEvent } from '@wcpos/scanner';

import { useAttributedWedge } from './use-attributed-wedge';

const mockToastShow = jest.fn();
const mockSetCapturedDevices = jest.fn();
const mockSetCaptureAll = jest.fn();
const mockRemove = jest.fn();
let capturedListener: ((payload: unknown) => void) | undefined;

jest.mock('react-native', () => ({
	Platform: { OS: 'android' },
}));

jest.mock('expo-modules-core', () => ({
	requireOptionalNativeModule: () => ({
		// Lazy closures: hoisted factory must not evaluate the mock consts early.
		setCapturedDevices: (...args: unknown[]) => mockSetCapturedDevices(...args),
		setCaptureAll: (...args: unknown[]) => mockSetCaptureAll(...args),
		addListener: (_event: string, listener: (payload: unknown) => void) => {
			capturedListener = listener;
			return { remove: mockRemove };
		},
	}),
}));

jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));

jest.mock('@wcpos/utils/logger', () => {
	const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
	return { getLogger: () => logger };
});

const profile = {
	id: 'profile-1',
	label: 'Front counter',
	connectionType: 'wedge-attributed',
	deviceName: 'ACME Scanner',
	vendorId: 1234,
	productId: 5678,
};

// Stable collection identity — a fresh object per render would defeat the
// hook's useMemo and loop the observable subscription.
const mockProfiles$ = of([profile]);
const mockCollection = { find: () => ({ $: mockProfiles$ }) };

jest.mock('../use-collection', () => ({
	useCollection: () => ({ collection: mockCollection }),
}));

const prefix$ = new BehaviorSubject('');
const suffix$ = new BehaviorSubject('');
const minChars$ = new BehaviorSubject(8);

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			barcode_scanning_prefix$: prefix$,
			barcode_scanning_suffix$: suffix$,
			barcode_scanning_min_chars$: minChars$,
		},
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		values ? `${key}:${JSON.stringify(values)}` : key,
}));

function key(payload: Partial<{ key: string; vendorId: number; productId: number }>) {
	capturedListener?.({
		key: payload.key ?? 'x',
		deviceId: 7,
		deviceName: 'ACME Scanner',
		vendorId: payload.vendorId ?? 1234,
		productId: payload.productId ?? 5678,
		timeMs: 0,
		captured: true,
	});
}

describe('useAttributedWedge', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		capturedListener = undefined;
	});

	it('registers profile identities with the native interceptor', () => {
		renderHook(() => useAttributedWedge());
		expect(mockSetCapturedDevices).toHaveBeenCalledWith([
			{ vendorId: 1234, productId: 5678, deviceName: 'ACME Scanner' },
		]);
	});

	it('assembles captured keys into an attributed ScanEvent on Enter', () => {
		const { result } = renderHook(() => useAttributedWedge());
		const events: ScanEvent[] = [];
		const subscription = result.current.scanEvents$.subscribe((event) => events.push(event));

		act(() => {
			for (const character of '9310988001234'.split('')) key({ key: character });
			key({ key: 'Enter' });
		});

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			code: '9310988001234',
			source: { kind: 'wedge-attributed', profileId: 'profile-1', deviceName: 'ACME Scanner' },
		});
		subscription.unsubscribe();
	});

	it('rejects a too-short burst with the shared feedback and no event', () => {
		const { result } = renderHook(() => useAttributedWedge());
		const events: ScanEvent[] = [];
		const subscription = result.current.scanEvents$.subscribe((event) => events.push(event));

		act(() => {
			for (const character of '4011'.split('')) key({ key: character });
			key({ key: 'Enter' });
		});

		expect(events).toHaveLength(0);
		expect(mockToastShow).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'warning', duration: 6000 })
		);
		subscription.unsubscribe();
	});

	it('ignores keys from devices without a matching profile', () => {
		const { result } = renderHook(() => useAttributedWedge());
		const events: ScanEvent[] = [];
		const subscription = result.current.scanEvents$.subscribe((event) => events.push(event));

		act(() => {
			for (const character of '9310988001234'.split(''))
				key({ key: character, vendorId: 9, productId: 9 });
			key({ key: 'Enter', vendorId: 9, productId: 9 });
		});

		expect(events).toHaveLength(0);
		subscription.unsubscribe();
	});

	it('clears the native registry and listener on unmount', () => {
		const { unmount } = renderHook(() => useAttributedWedge());
		unmount();
		expect(mockRemove).toHaveBeenCalled();
		expect(mockSetCapturedDevices).toHaveBeenLastCalledWith([]);
	});
});
