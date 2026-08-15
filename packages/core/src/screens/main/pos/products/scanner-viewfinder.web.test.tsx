/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { ScannerViewfinder } from './scanner-viewfinder.web';

import type { DecodeLoopOptions } from './decode-loop';

const mockCreateBarcodeDetector = jest.fn(() => ({ detect: jest.fn() }));
const mockStopLoop = jest.fn();
let capturedLoopOptions: DecodeLoopOptions<ImageBitmap> | null = null;

jest.mock('./camera-decoder.web', () => ({
	createBarcodeDetector: () => mockCreateBarcodeDetector(),
}));
jest.mock('./decode-loop', () => ({
	startDecodeLoop: (options: DecodeLoopOptions<ImageBitmap>) => {
		capturedLoopOptions = options;
		return mockStopLoop;
	},
}));

const stopTrack = jest.fn();
const stream = {
	getTracks: () => [{ stop: stopTrack }],
	getVideoTracks: () => [{ getSettings: () => ({ width: 1280, height: 720 }) }],
} as unknown as MediaStream;

async function flushStart() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

beforeEach(() => {
	jest.clearAllMocks();
	capturedLoopOptions = null;
	Object.defineProperty(navigator, 'mediaDevices', {
		configurable: true,
		value: { getUserMedia: jest.fn(async () => stream) },
	});
});

afterEach(() => {
	jest.restoreAllMocks();
});

describe('ScannerViewfinder', () => {
	it('clears a decoder error after a successful empty decode', async () => {
		jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
		const onStatusChange = jest.fn();
		render(<ScannerViewfinder onScan={jest.fn()} onStatusChange={onStatusChange} />);
		await flushStart();

		act(() => {
			capturedLoopOptions?.onError(new Error('decode failed'), {
				consecutive: 5,
				total: 5,
			});
		});
		expect(onStatusChange).toHaveBeenLastCalledWith('decoder-error');

		act(() => {
			capturedLoopOptions?.onResult([]);
		});
		expect(onStatusChange).toHaveBeenLastCalledWith('scanning');
	});

	it('does not start decoding when unmounted during video playback', async () => {
		let resolvePlay: (() => void) | undefined;
		jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolvePlay = resolve;
				})
		);
		const rendered = render(<ScannerViewfinder onScan={jest.fn()} />);
		await act(async () => {
			await Promise.resolve();
		});

		rendered.unmount();
		await act(async () => {
			resolvePlay?.();
			await Promise.resolve();
		});

		expect(capturedLoopOptions).toBeNull();
	});
});
