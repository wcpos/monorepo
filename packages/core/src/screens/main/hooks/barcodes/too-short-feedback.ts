import { Toast } from '@wcpos/components/toast';
import { getLogger } from '@wcpos/utils/logger';

const barcodeLogger = getLogger(['wcpos', 'barcode', 'detection']);

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Shared min-length rejection feedback for the sources whose input is a scan by
 * construction (attributed wedge, camera, serial/HID): a short code there is a
 * genuine scan with a genuine problem, so it always toasts.
 */
export function showTooShortFeedback(t: Translate, barcode: string, minLength: number) {
	Toast.show({
		type: 'warning',
		title: t('common.barcode_scanned', { barcode }),
		description: t('common.barcode_must_be_at_least_characters', { minLength }),
		duration: 6000,
	});
	barcodeLogger.warn('Scanned barcode was shorter than the minimum length', {
		context: {
			barcode,
			minLength,
			actualLength: barcode.length,
		},
	});
}

/** At most one heuristic-wedge too-short toast per this window. */
export const HEURISTIC_TOO_SHORT_WARN_INTERVAL_MS = 30_000;

/**
 * The timing heuristic can't tell a mis-configured scanner from a fast typist,
 * so its too-short toast fires only when the burst is scan-shaped: it ended
 * with a terminator (Enter/Tab — scanners send one, typists rarely do) or is
 * all digits. Pure so the rule is unit-testable.
 */
export function isScanShapedBurst(code: string, terminated: boolean): boolean {
	return terminated || /^\d+$/.test(code);
}

let lastHeuristicWarnMs = Number.NEGATIVE_INFINITY;

/** Test-only: reset the heuristic toast rate limiter. */
export function resetHeuristicTooShortRateLimit() {
	lastHeuristicWarnMs = Number.NEGATIVE_INFINITY;
}

/**
 * Heuristic-wedge variant: toast only for scan-shaped bursts, rate limited so a
 * cashier typing quick short searches isn't scolded on every keystroke burst.
 * Every rejection is still logged, and the settings test panel records it under
 * Recent attempts — suppression hides the toast, not the event.
 */
export function showHeuristicTooShortFeedback(
	t: Translate,
	barcode: string,
	minLength: number,
	options: { terminated: boolean; now?: () => number }
) {
	const now = options.now ?? Date.now;
	const scanShaped = isScanShapedBurst(barcode, options.terminated);
	const shouldToast =
		scanShaped && now() - lastHeuristicWarnMs >= HEURISTIC_TOO_SHORT_WARN_INTERVAL_MS;
	if (shouldToast) {
		lastHeuristicWarnMs = now();
		Toast.show({
			type: 'warning',
			title: t('common.barcode_scanned', { barcode }),
			description: t('common.barcode_must_be_at_least_characters', { minLength }),
			duration: 6000,
		});
	}
	barcodeLogger.warn('Fast keystroke burst was shorter than the minimum length', {
		context: {
			barcode,
			minLength,
			actualLength: barcode.length,
			terminated: options.terminated,
			toastShown: shouldToast,
		},
	});
}
