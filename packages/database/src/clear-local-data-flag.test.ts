/**
 * Native flag: a marker file in the document directory, because native has no
 * localStorage. Web behaviour is covered in clear-local-data-flag.web.test.ts.
 */
import {
	isClearLocalDataOnNextLoadScheduled,
	scheduleClearLocalDataOnNextLoad,
	unscheduleClearLocalDataOnNextLoad,
} from './clear-local-data-flag';

const files = new Map<string, string>();
let failWrites = false;

jest.mock('expo-file-system', () => ({
	Paths: { document: '/documents' },
	File: class MockFile {
		private readonly path: string;

		constructor(parent: string, name: string) {
			this.path = `${parent}/${name}`;
		}

		get exists() {
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
	});

	it('round-trips schedule → isScheduled → unschedule through the marker file', () => {
		expect(isClearLocalDataOnNextLoadScheduled()).toBe(false);
		expect(scheduleClearLocalDataOnNextLoad()).toBe(true);
		expect(isClearLocalDataOnNextLoadScheduled()).toBe(true);
		unscheduleClearLocalDataOnNextLoad();
		expect(isClearLocalDataOnNextLoadScheduled()).toBe(false);
	});

	it('reports failure instead of throwing when the marker cannot be written', () => {
		failWrites = true;
		expect(scheduleClearLocalDataOnNextLoad()).toBe(false);
		expect(isClearLocalDataOnNextLoadScheduled()).toBe(false);
	});

	it('unschedule is a safe no-op when no marker exists', () => {
		expect(() => unscheduleClearLocalDataOnNextLoad()).not.toThrow();
	});
});
