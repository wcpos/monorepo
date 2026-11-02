/**
 * Native anchor: a marker file in the document directory, because native has no
 * localStorage. Web behaviour is covered in till-anchor.web.test.ts.
 */
import { clearTillAnchor, readTillAnchor, writeTillAnchor } from './till-anchor';

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

		textSync() {
			const content = files.get(this.path);
			if (content === undefined) {
				throw new Error('file does not exist');
			}
			return content;
		}

		writeSync(content: string) {
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

describe('till-anchor (native)', () => {
	beforeEach(() => {
		files.clear();
		failWrites = false;
		failReads = false;
	});

	it('reads null when no marker exists', () => {
		expect(readTillAnchor()).toBeNull();
	});

	it('round-trips write → read → clear through the marker file', () => {
		expect(writeTillAnchor('till-1')).toBe(true);
		expect(files.get('/documents/wcpos.tillId')).toBe('till-1');
		expect(readTillAnchor()).toBe('till-1');
		clearTillAnchor();
		expect(readTillAnchor()).toBeNull();
	});

	it("reads 'unknown' when the filesystem throws — an unreadable anchor is not an absent one", () => {
		writeTillAnchor('till-1');
		failReads = true;
		expect(readTillAnchor()).toBe('unknown');
	});

	it('reports failure instead of throwing when the marker cannot be written', () => {
		failWrites = true;
		expect(writeTillAnchor('till-1')).toBe(false);
		expect(readTillAnchor()).toBeNull();
	});

	it('clear is a safe no-op when no marker exists or the filesystem throws', () => {
		expect(() => clearTillAnchor()).not.toThrow();
		failReads = true;
		expect(() => clearTillAnchor()).not.toThrow();
	});
});
