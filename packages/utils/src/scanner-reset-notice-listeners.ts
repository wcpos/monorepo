/** Device-local flag for the one-time "scanner settings were reset" notice. */
export const SCANNER_RESET_NOTICE_KEY = 'wcpos.scannerSettingsResetNotice';

/** The flag's persistence on one platform; any of these may throw. */
export interface ScannerResetNoticeStorage {
	read(): boolean;
	write(): void;
	clear(): void;
}

/** A throwing storage reads as not armed and never throws out: the notice is advisory. */
export function createScannerResetNotice(storage: ScannerResetNoticeStorage) {
	const listeners = new Set<() => void>();
	const notify = () => [...listeners].forEach((listener) => listener());
	return {
		arm(): void {
			try {
				storage.write();
			} catch {
				// Advisory: an unwritable flag only means the notice does not show.
			}
			notify();
		},
		isArmed(): boolean {
			try {
				return storage.read();
			} catch {
				return false;
			}
		},
		dismiss(): void {
			try {
				storage.clear();
			} catch {
				// Advisory: a flag that cannot be cleared shows the notice again next launch.
			}
			notify();
		},
		subscribe(listener: () => void): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
