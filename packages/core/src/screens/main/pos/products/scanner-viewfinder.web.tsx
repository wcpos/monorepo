import * as React from 'react';
import { View } from 'react-native';

import { type BarcodeFormat } from 'barcode-detector/pure';

import { getLogger } from '@wcpos/utils/logger';

import { createBarcodeDetector } from './camera-decoder.web';
import { startDecodeLoop } from './decode-loop';
import { type ScannerViewfinderProps } from './scanner-viewfinder-types';

const logger = getLogger(['wcpos', 'barcode', 'camera']);

/**
 * W3C BarcodeDetector format → expo-camera BarcodeType. The scan-session's
 * retail check-digit gate matches on the expo names ('ean13', not 'ean_13'),
 * and the native viewfinder reports expo names, so the web path must map back
 * to keep symbology handling identical across platforms.
 */
const WEB_TO_EXPO_TYPE: Record<string, string> = {
	ean_13: 'ean13',
	ean_8: 'ean8',
	upc_a: 'upc_a',
	upc_e: 'upc_e',
	code_128: 'code128',
	qr_code: 'qr',
};
const WEB_FORMATS = Object.keys(WEB_TO_EXPO_TYPE) as BarcodeFormat[];

// Chromium's default capture is 640×480 — too few pixels across an EAN-13 for
// reliable decoding with a typical fixed-focus webcam (#905 root cause). Ask
// for 720p; the browser falls back gracefully when the camera can't provide it.
const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
	audio: false,
	video: {
		facingMode: { ideal: 'environment' },
		width: { ideal: 1280 },
		height: { ideal: 720 },
	},
};

// Keep decode-failure logging bounded: the loop runs ~5×/s, so a persistent
// fault would otherwise flood the logs.
const LOGGED_ERRORS_HEAD = 3;
const LOGGED_ERRORS_EVERY = 50;
// Surface a persistent decoder fault in the UI after this many consecutive
// failures (~1s of dead scanning).
const DECODER_ERROR_THRESHOLD = 5;

/**
 * Web/Electron viewfinder: own camera stream + own decode loop over the
 * zxing-wasm ponyfill. Replaces expo-camera's web scan loop, which neither
 * surfaces decode errors nor requests a usable capture resolution (#905).
 */
export function ScannerViewfinder({ onScan, onStatusChange }: ScannerViewfinderProps) {
	const videoRef = React.useRef<HTMLVideoElement | null>(null);

	const onScanRef = React.useRef(onScan);
	const onStatusChangeRef = React.useRef(onStatusChange);
	React.useEffect(() => {
		onScanRef.current = onScan;
	}, [onScan]);
	React.useEffect(() => {
		onStatusChangeRef.current = onStatusChange;
	}, [onStatusChange]);

	React.useEffect(() => {
		// The ref is populated by the time the effect runs; capture the element so
		// the cleanup releases the same node it configured.
		const videoElement = videoRef.current;
		let cancelled = false;
		let stream: MediaStream | null = null;
		let stopLoop: (() => void) | undefined;
		let decoderErrorReported = false;

		const setStatus = (status: Parameters<NonNullable<typeof onStatusChange>>[0]) => {
			if (!cancelled) {
				onStatusChangeRef.current?.(status);
			}
		};

		const start = async () => {
			setStatus('initializing');

			let detector: ReturnType<typeof createBarcodeDetector>;
			try {
				detector = createBarcodeDetector(WEB_FORMATS);
			} catch (error) {
				logger.error('Barcode decoder failed to initialize', {
					context: { error: String(error) },
				});
				setStatus('decoder-error');
				return;
			}

			try {
				stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
			} catch (error) {
				const name = error instanceof DOMException ? error.name : 'UnknownError';
				logger.error('Camera stream unavailable', { context: { error: String(error), name } });
				setStatus(name === 'NotAllowedError' ? 'camera-denied' : 'camera-unavailable');
				return;
			}

			const video = videoRef.current;
			if (cancelled || !video) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}
			video.srcObject = stream;
			try {
				await video.play();
			} catch {
				// Autoplay rejection is benign here: the element is muted and
				// playback starts as soon as frames arrive.
			}

			const settings = stream.getVideoTracks()[0]?.getSettings?.();
			logger.info('Camera scanning started', {
				context: { width: settings?.width, height: settings?.height },
			});
			setStatus('scanning');

			stopLoop = startDecodeLoop<ImageBitmap>({
				grabFrame: async () => {
					const el = videoRef.current;
					if (!el || el.readyState < el.HAVE_ENOUGH_DATA || !el.videoWidth) {
						return null;
					}
					return await createImageBitmap(el);
				},
				detect: async (bitmap) => {
					const results = await detector.detect(bitmap);
					return results.map((result) => ({
						rawValue: result.rawValue,
						format: result.format,
					}));
				},
				releaseFrame: (bitmap) => bitmap.close(),
				onResult: (barcodes) => {
					if (decoderErrorReported) {
						decoderErrorReported = false;
						setStatus('scanning');
					}
					for (const barcode of barcodes) {
						onScanRef.current({
							data: barcode.rawValue,
							type: WEB_TO_EXPO_TYPE[barcode.format] ?? barcode.format,
						});
					}
				},
				onError: (error, stats) => {
					if (stats.total <= LOGGED_ERRORS_HEAD || stats.total % LOGGED_ERRORS_EVERY === 0) {
						logger.error('Barcode decode failed', {
							context: { error: String(error), ...stats },
						});
					}
					if (stats.consecutive >= DECODER_ERROR_THRESHOLD && !decoderErrorReported) {
						decoderErrorReported = true;
						setStatus('decoder-error');
					}
				},
			});
		};

		void start();

		return () => {
			cancelled = true;
			stopLoop?.();
			stream?.getTracks().forEach((track) => track.stop());
			if (videoElement) {
				videoElement.srcObject = null;
			}
		};
	}, []);

	return (
		<View className="h-full w-full" testID="scanner-viewfinder">
			{React.createElement('video', {
				ref: videoRef,
				autoPlay: true,
				playsInline: true,
				muted: true,
				style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
			})}
		</View>
	);
}
