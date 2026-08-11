/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { Subject } from 'rxjs';

import { CameraScannerPanel } from './camera-scanner-panel';

import type { ScannerViewfinderProps, ViewfinderStatus } from './scanner-viewfinder-types';

let mockGranted = true;
const mockRequestPermission = jest.fn();
const mockOnScan = jest.fn();
const mockReset = jest.fn();
const cameraEvents$ = new Subject<{ source: { kind: string } }>();
let capturedViewfinderProps: ScannerViewfinderProps | null = null;

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
});
