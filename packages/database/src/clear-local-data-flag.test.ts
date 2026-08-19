/**
 * Native flag: a marker file in the document directory, because native has no
 * localStorage. Web behaviour is covered in clear-local-data-flag.web.test.ts.
 */
import {
	readClearLocalDataOnNextLoadFlag,
	scheduleClearLocalDataOnNextLoad,
	unscheduleClearLocalDataOnNextLoad,
} from './clear-local-data-flag';

const files = new Map<string, string>();
let failWrites = false;
let failReads = false;

jest.mock('expo-file-system', () => ({
	Paths: { document: '/documents' },
	File: class MockFile {
		private readonly path: string;

		constructor(parent: string, name: string) {
			this.path = `${parent}/${name}`;
		}

		get exists() {
			if (failReads) {
				throw new Error('filesystem unavailable');
			}
			return files.has(this.path);
		}

		write(content: string) {
			if (failWrites) {
				throw new Error('disk full');
			}
			files.set(this.path, content);
		}

		delete() {
			if (!files.has(this.path)) {
				throw new Error('file does not exist');
			}
			files.delete(this.path);
		}
	},
}));

describe('clear-local-data-flag (native)', () => {
	beforeEach(() => {
		files.clear();
		failWrites = false;
		failReads = false;
	});

	it('round-trips schedule → read → unschedule through the marker file', () => {
		expect(readClearLocalDataOnNextLoadFlag()).toBe('not-scheduled');
		expect(scheduleClearLocalDataOnNextLoad()).toBe(true);
		expect(readClearLocalDataOnNextLoadFlag()).toBe('scheduled');
		unscheduleClearLocalDataOnNextLoad();
		expect(readClearLocalDataOnNextLoadFlag()).toBe('not-scheduled');
	});

	it('reports failure instead of throwing when the marker cannot be written', () => {
		failWrites = true;
		expect(scheduleClearLocalDataOnNextLoad()).toBe(false);
		expect(readClearLocalDataOnNextLoadFlag()).toBe('not-scheduled');
	});

	it("reports 'unknown' when the marker cannot be read — an armed flag may hide behind the error", () => {
		failReads = true;
		expect(readClearLocalDataOnNextLoadFlag()).toBe('unknown');
	});

	it('a failed removal stays observable through the read', () => {
		scheduleClearLocalDataOnNextLoad();
		failReads = true;
		// unschedule's own exists check fails, so the marker survives …
		unscheduleClearLocalDataOnNextLoad();
		failReads = false;
		// … and the verification read still reports it armed.
		expect(readClearLocalDataOnNextLoadFlag()).toBe('scheduled');
	});

	it('unschedule is a safe no-op when no marker exists', () => {
		expect(() => unscheduleClearLocalDataOnNextLoad()).not.toThrow();
	});
});
