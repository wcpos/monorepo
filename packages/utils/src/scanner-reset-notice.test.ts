/**
 * Native flag: a marker file in the document directory. The listener contract is covered in
 * scanner-reset-notice.web.test.ts; both platforms share it.
 */
const files = new Set<string>();
let fail: 'read' | 'write' | null = null;

jest.mock('expo-file-system', () => ({
	Paths: { document: '/documents' },
	File: class MockFile {
		private readonly path: string;

		constructor(parent: string, name: string) {
			this.path = `${parent}/${name}`;
		}

		get exists() {
			if (fail === 'read') throw new Error('filesystem unavailable');
			return files.has(this.path);
		}

		writeSync() {
			if (fail === 'write') throw new Error('disk full');
			files.add(this.path);
		}

		delete() {
			files.delete(this.path);
		}
	},
}));

// eslint-disable-next-line import/first -- the filesystem mock above must be in place first.
import {
	armScannerResetNotice,
	dismissScannerResetNotice,
	isScannerResetNoticeArmed,
	subscribeScannerResetNotice,
} from './scanner-reset-notice';

describe('scanner reset notice (native)', () => {
	beforeEach(() => {
		files.clear();
		fail = null;
	});

	it('keeps the flag as a marker file outside the database directories', () => {
		const listener = jest.fn();
		const unsubscribe = subscribeScannerResetNotice(listener);
		armScannerResetNotice();

		expect([...files]).toEqual(['/documents/wcpos.scannerSettingsResetNotice']);
		expect(isScannerResetNoticeArmed()).toBe(true);
		dismissScannerResetNotice();
		expect(isScannerResetNoticeArmed()).toBe(false);
		expect(files.size).toBe(0);
		expect(listener).toHaveBeenCalledTimes(2);
		unsubscribe();
	});

	it('reads a throwing filesystem as not armed, without throwing', () => {
		files.add('/documents/wcpos.scannerSettingsResetNotice');
		fail = 'read';

		expect(isScannerResetNoticeArmed()).toBe(false);
		expect(() => dismissScannerResetNotice()).not.toThrow();
	});

	it('does not throw when the marker cannot be written', () => {
		fail = 'write';

		expect(() => armScannerResetNotice()).not.toThrow();
		expect(isScannerResetNoticeArmed()).toBe(false);
	});
});
