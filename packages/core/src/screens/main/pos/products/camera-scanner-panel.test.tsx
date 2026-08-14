/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import { CameraScannerPanel } from './camera-scanner-panel';

import type { ScannerViewfinderProps, ViewfinderStatus } from './scanner-viewfinder-types';

let mockGranted = true;
const mockRequestPermission = jest.fn();
const mockOnScan = jest.fn();
const mockReset = jest.fn();
const cameraEvents$ = new Subject<{ source: { kind: string } }>();
let capturedViewfinderProps: ScannerViewfinderProps | null = null;
let mockEchoScannerHeight = true;

interface ResizeHandleProps {
	accessibilityActions?: readonly { name: string }[];
	accessibilityRole?: string;
	accessibilityValue?: { min?: number; max?: number; now?: number };
	onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
}

let capturedResizeHandleProps: ResizeHandleProps | null = null;

jest.mock('expo-camera', () => ({
	useCameraPermissions: () => [{ granted: mockGranted }, mockRequestPermission],
}));
// The real component package pulls in uniwind + expo-haptics, which don't load
// in jsdom — substitute minimal DOM equivalents.
jest.mock('@wcpos/components/button', () => ({
	Button: ({ onPress, children }: { onPress?: () => void; children?: React.ReactNode }) => (
		<button onClick={onPress}>{children}</button>
	),
	ButtonText: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({
		onPress,
		testID,
		className,
	}: {
		onPress?: () => void;
		testID?: string;
		className?: string;
	}) => <button data-testid={testID} data-class-name={className} onClick={onPress} />,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name?: string }) => <span data-icon-name={name} />,
}));

// Capture the pan gesture callbacks so drag gestures can be simulated
// directly — jsdom has no real gesture pipeline.
const mockPanCallbacks: {
	onUpdate?: (event: { translationY: number }) => void;
	onFinalize?: (event: { translationY: number }) => void;
	hitSlop?: { top: number; bottom: number };
} = {};
jest.mock('react-native-gesture-handler', () => ({
	GestureDetector: ({ children }: { children?: React.ReactNode }) => {
		if (React.isValidElement<ResizeHandleProps>(children)) {
			capturedResizeHandleProps = children.props;
		}
		return <>{children}</>;
	},
	Gesture: {
		Pan: () => {
			const gesture = {
				runOnJS: () => gesture,
				hitSlop: (slop: { top: number; bottom: number }) => {
					mockPanCallbacks.hitSlop = slop;
					return gesture;
				},
				onUpdate: (callback: (event: { translationY: number }) => void) => {
					mockPanCallbacks.onUpdate = callback;
					return gesture;
				},
				onFinalize: (callback: (event: { translationY: number }) => void) => {
					mockPanCallbacks.onFinalize = callback;
					return gesture;
				},
			};
			return gesture;
		},
	},
}));

// Persisted scannerHeight lane: patchUI echoes the write back through the
// observable, matching RxState behaviour.
const scannerHeight$ = new BehaviorSubject<number>(176);
const mockPatchUI = jest.fn((patch: { scannerHeight?: number }) => {
	if (mockEchoScannerHeight && typeof patch.scannerHeight === 'number') {
		scannerHeight$.next(patch.scannerHeight);
	}
});
// uiSettings must be referentially stable across renders (the real RxState
// instance is) — a fresh object each render would re-run the panel's
// clear-override subscription and wipe in-progress drag state.
const mockUISettings = { scannerHeight$ };
jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: mockUISettings, patchUI: mockPatchUI }),
}));

jest.mock('./scanner-viewfinder', () => ({
	ScannerViewfinder: (props: ScannerViewfinderProps) => {
		capturedViewfinderProps = props;
		return null;
	},
}));
jest.mock('./use-camera-scan', () => ({
	useCameraScan: () => ({ onScan: mockOnScan, reset: mockReset }),
}));
jest.mock('../../hooks/barcodes/camera-scan-context', () => ({
	useCameraScanBus: () => ({ events$: cameraEvents$, emit: jest.fn() }),
}));
jest.mock('../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../jest/translate')>(
		'../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

// Scan-readiness note (replaces the red outage banner above the grid).
let mockEngineGatedBy: string | null = null;
let mockOnlineStatus = 'online-website-available';
let mockStorageDegraded = false;
jest.mock('../../hooks/use-engine-monitor', () => ({
	useEngineStatus: () => ({ connectivity: 'online', gatedBy: mockEngineGatedBy }),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnlineStatus }),
}));
jest.mock('../../hooks/use-storage-health', () => ({
	useStorageDegraded: () => mockStorageDegraded,
}));

beforeEach(() => {
	jest.clearAllMocks();
	mockGranted = true;
	capturedViewfinderProps = null;
	mockEngineGatedBy = null;
	mockOnlineStatus = 'online-website-available';
	mockStorageDegraded = false;
	capturedResizeHandleProps = null;
	mockEchoScannerHeight = true;
	scannerHeight$.next(176);
});

describe('CameraScannerPanel', () => {
	it('gates on camera permission and requests it from the prompt', () => {
		mockGranted = false;
		render(<CameraScannerPanel onClose={jest.fn()} />);

		expect(screen.getByTestId('camera-permission-request')).toBeTruthy();
		expect(screen.queryByTestId('camera-scanner-panel')).toBeNull();

		fireEvent.click(screen.getByText('Allow camera'));
		expect(mockRequestPermission).toHaveBeenCalledTimes(1);
	});

	it('renders the viewfinder wired to the scan pipeline and resets dedup on open', () => {
		render(<CameraScannerPanel onClose={jest.fn()} />);

		expect(screen.getByTestId('camera-scanner-panel')).toBeTruthy();
		expect(mockReset).toHaveBeenCalledTimes(1);
		expect(capturedViewfinderProps?.onScan).toBe(mockOnScan);
	});

	it('closes via the overlay button', () => {
		const onClose = jest.fn();
		render(<CameraScannerPanel onClose={onClose} />);

		const closeButton = screen.getByTestId('camera-scanner-close');
		expect(closeButton.getAttribute('data-class-name')).toBe('text-white');
		fireEvent.click(closeButton);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('surfaces viewfinder status messages instead of failing silently', () => {
		render(<CameraScannerPanel onClose={jest.fn()} />);

		act(() => {
			capturedViewfinderProps?.onStatusChange?.('decoder-error' as ViewfinderStatus);
		});
		expect(screen.getByTestId('camera-scanner-status').textContent).toContain(
			'Barcode decoding is failing'
		);

		act(() => {
			capturedViewfinderProps?.onStatusChange?.('scanning' as ViewfinderStatus);
		});
		expect(screen.queryByTestId('camera-scanner-status')).toBeNull();
	});

	it('flashes on an accepted camera scan and clears after the timeout', () => {
		jest.useFakeTimers();
		try {
			render(<CameraScannerPanel onClose={jest.fn()} />);

			expect(screen.queryByTestId('camera-scanner-flash')).toBeNull();

			act(() => {
				cameraEvents$.next({ source: { kind: 'camera' } });
			});
			expect(screen.getByTestId('camera-scanner-flash')).toBeTruthy();

			act(() => {
				jest.advanceTimersByTime(400);
			});
			expect(screen.queryByTestId('camera-scanner-flash')).toBeNull();

			// Non-camera events (e.g. HID wedge) must not flash the camera panel.
			act(() => {
				cameraEvents$.next({ source: { kind: 'hid' } });
			});
			expect(screen.queryByTestId('camera-scanner-flash')).toBeNull();
		} finally {
			jest.useRealTimers();
		}
	});

	// The red outage banner above the grid is gone; opening the camera while
	// scans may not fully resolve shows a quiet note in the panel instead.
	it('shows no readiness note while the engine is healthy', () => {
		render(<CameraScannerPanel onClose={jest.fn()} />);

		expect(screen.queryByTestId('camera-scanner-readiness')).toBeNull();
	});

	it.each(['lifecycle', 'bootstrap-failed'])(
		'notes that sync is still starting while gated by %s',
		(gatedBy) => {
			mockEngineGatedBy = gatedBy;
			render(<CameraScannerPanel onClose={jest.fn()} />);

			expect(screen.getByTestId('camera-scanner-readiness').textContent).toContain(
				'Sync is still starting'
			);
		}
	);

	it('notes local-only scanning while offline', () => {
		mockOnlineStatus = 'offline';
		render(<CameraScannerPanel onClose={jest.fn()} />);

		expect(screen.getByTestId('camera-scanner-readiness').textContent).toContain(
			'only products already on this device'
		);
	});

	// #163: a dead storage worker blocks every lookup — that note outranks the rest.
	it('prefers the storage outage note over an engine outage', () => {
		mockOnlineStatus = 'offline';
		mockStorageDegraded = true;
		render(<CameraScannerPanel onClose={jest.fn()} />);

		expect(screen.getByTestId('camera-scanner-readiness').textContent).toContain(
			'Local database unavailable'
		);
	});

	it('stacks the readiness note under a camera status message', () => {
		mockEngineGatedBy = 'lifecycle';
		render(<CameraScannerPanel onClose={jest.fn()} />);

		act(() => {
			capturedViewfinderProps?.onStatusChange?.('decoder-error' as ViewfinderStatus);
		});
		expect(screen.getByTestId('camera-scanner-status').textContent).toContain(
			'Barcode decoding is failing'
		);
		expect(screen.getByTestId('camera-scanner-readiness').textContent).toContain(
			'Sync is still starting'
		);
	});

	it('applies the persisted height and persists a drag-resize', () => {
		render(<CameraScannerPanel onClose={jest.fn()} />);

		const panel = screen.getByTestId('camera-scanner-panel');
		expect(panel.style.height).toBe('176px');
		expect(screen.getByTestId('camera-scanner-resize-handle')).toBeTruthy();

		act(() => {
			mockPanCallbacks.onUpdate?.({ translationY: 100 });
		});
		expect(panel.style.height).toBe('276px');

		act(() => {
			mockPanCallbacks.onFinalize?.({ translationY: 100 });
		});
		expect(mockPatchUI).toHaveBeenCalledWith({ scannerHeight: 276 });
		// The persisted write echoes back through ui-settings; height sticks.
		expect(panel.style.height).toBe('276px');
	});

	it('bases a consecutive drag on the displayed height before persistence echoes', () => {
		mockEchoScannerHeight = false;
		render(<CameraScannerPanel onClose={jest.fn()} />);

		const panel = screen.getByTestId('camera-scanner-panel');
		act(() => {
			mockPanCallbacks.onUpdate?.({ translationY: 100 });
			mockPanCallbacks.onFinalize?.({ translationY: 100 });
		});
		expect(panel.style.height).toBe('276px');

		act(() => {
			mockPanCallbacks.onUpdate?.({ translationY: 10 });
			mockPanCallbacks.onFinalize?.({ translationY: 10 });
		});
		expect(panel.style.height).toBe('286px');
		expect(mockPatchUI).toHaveBeenLastCalledWith({ scannerHeight: 286 });

		act(() => scannerHeight$.next(276));
		expect(panel.style.height).toBe('286px');

		act(() => scannerHeight$.next(286));
		expect(panel.style.height).toBe('286px');
	});

	it('supports bounded increment and decrement accessibility actions', () => {
		render(<CameraScannerPanel onClose={jest.fn()} />);

		expect(capturedResizeHandleProps?.accessibilityRole).toBe('adjustable');
		expect(capturedResizeHandleProps?.accessibilityActions).toEqual([
			{ name: 'increment' },
			{ name: 'decrement' },
		]);
		expect(capturedResizeHandleProps?.accessibilityValue).toEqual({
			min: 96,
			max: 480,
			now: 176,
		});

		act(() => scannerHeight$.next(475));
		act(() =>
			capturedResizeHandleProps?.onAccessibilityAction?.({
				nativeEvent: { actionName: 'increment' },
			})
		);
		expect(mockPatchUI).toHaveBeenLastCalledWith({ scannerHeight: 480 });

		act(() => scannerHeight$.next(100));
		act(() =>
			capturedResizeHandleProps?.onAccessibilityAction?.({
				nativeEvent: { actionName: 'decrement' },
			})
		);
		expect(mockPatchUI).toHaveBeenLastCalledWith({ scannerHeight: 96 });
	});

	it('keeps the handle band slim while hitSlop preserves the 44px touch target', () => {
		render(<CameraScannerPanel onClose={jest.fn()} />);

		const handle = screen.getByTestId('camera-scanner-resize-handle');
		expect(handle.style.height).toBe('20px');
		// 20px of layout + 12px slop each side = the 44px minimum touch target.
		expect(mockPanCallbacks.hitSlop).toEqual({ top: 12, bottom: 12 });
	});

	it('clamps drag-resize to the min/max bounds', () => {
		render(<CameraScannerPanel onClose={jest.fn()} />);

		const panel = screen.getByTestId('camera-scanner-panel');

		act(() => {
			mockPanCallbacks.onUpdate?.({ translationY: -500 });
		});
		expect(panel.style.height).toBe('96px');

		act(() => {
			mockPanCallbacks.onUpdate?.({ translationY: 5000 });
		});
		expect(panel.style.height).toBe('480px');

		act(() => {
			mockPanCallbacks.onFinalize?.({ translationY: 5000 });
		});
		expect(mockPatchUI).toHaveBeenCalledWith({ scannerHeight: 480 });
	});
});
