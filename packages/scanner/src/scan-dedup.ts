import { defer, type MonoTypeOperatorFunction, type Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

import type { ScanEvent } from './scan-events';

/**
 * One physical scan can reach the POS through two sources: the keyboard wedge
 * AND a direct HID-POS or serial connection to the same dongle (#2263). The
 * wedge emits only after its burst settles (BURST_SETTLE_MS = 150 after the last
 * key), so its copy can trail the structured source's by the whole burst plus
 * the settle, about 300 ms for a 13-digit code. A cashier's deliberate re-scan
 * of the same item takes longer than 500 ms, so that stays a second scan.
 */
export const SCAN_DEDUP_WINDOW_MS = 500;

export function dedupeScans(
	windowMs = SCAN_DEDUP_WINDOW_MS,
	now: () => number = Date.now
): MonoTypeOperatorFunction<ScanEvent> {
	return (source$: Observable<ScanEvent>) =>
		defer(() => {
			const lastPassed = new Map<string, number>();
			return source$.pipe(
				filter((event) => {
					const receiptTime = now();
					for (const [code, passedAt] of lastPassed) {
						if (receiptTime - passedAt > windowMs) lastPassed.delete(code);
					}
					const passedAt = lastPassed.get(event.code);
					if (passedAt !== undefined && receiptTime - passedAt < windowMs) return false;
					lastPassed.set(event.code, receiptTime);
					return true;
				})
			);
		});
}
