/**
 * Continuous camera decode loop, decoupled from the DOM so the retry/error
 * accounting is unit-testable. The web viewfinder injects frame capture
 * (createImageBitmap) and detection (BarcodeDetector.detect); this module owns
 * pacing, cleanup, and error statistics. Every failure reaches `onError` —
 * the silent-swallow failure mode of expo-camera's web loop (#905) is the
 * reason this loop exists.
 */

export interface DecodedBarcode {
	rawValue: string;
	format: string;
}

export interface DecodeErrorStats {
	/** Errors since the last successful detect call. */
	consecutive: number;
	/** Errors over the loop's lifetime. */
	total: number;
}

export interface DecodeLoopOptions<Frame> {
	/** Capture the current frame; resolve null when the source isn't ready yet. */
	grabFrame: () => Promise<Frame | null>;
	detect: (frame: Frame) => Promise<DecodedBarcode[]>;
	/** Always called for a grabbed frame, success or failure (e.g. bitmap.close()). */
	releaseFrame?: (frame: Frame) => void;
	onResult: (barcodes: DecodedBarcode[]) => void;
	onError: (error: unknown, stats: DecodeErrorStats) => void;
	intervalMs?: number;
}

export const DEFAULT_DECODE_INTERVAL_MS = 200;

/** Starts the loop; returns a stop function (idempotent). */
export function startDecodeLoop<Frame>(options: DecodeLoopOptions<Frame>): () => void {
	const intervalMs = options.intervalMs ?? DEFAULT_DECODE_INTERVAL_MS;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let consecutive = 0;
	let total = 0;

	const tick = async () => {
		if (stopped) {
			return;
		}
		try {
			const frame = await options.grabFrame();
			if (frame !== null) {
				let barcodes: DecodedBarcode[];
				try {
					barcodes = await options.detect(frame);
				} finally {
					options.releaseFrame?.(frame);
				}
				consecutive = 0;
				if (!stopped) {
					options.onResult(barcodes);
				}
			}
		} catch (error) {
			consecutive += 1;
			total += 1;
			if (!stopped) {
				options.onError(error, { consecutive, total });
			}
		} finally {
			if (!stopped) {
				timer = setTimeout(() => void tick(), intervalMs);
			}
		}
	};

	void tick();

	return () => {
		stopped = true;
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	};
}
