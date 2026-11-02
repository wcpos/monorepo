import {
	clearTillAnchor,
	readTillAnchor,
	TILL_ANCHOR_KEY,
	writeTillAnchor,
} from './till-anchor.web';

const withStorage = () => {
	const store = new Map<string, string>();
	(globalThis as { window?: unknown }).window = {
		localStorage: {
			setItem: (key: string, value: string) => store.set(key, value),
			getItem: (key: string) => store.get(key) ?? null,
			removeItem: (key: string) => store.delete(key),
		},
	};
	return store;
};

describe('till-anchor (web)', () => {
	afterEach(() => {
		delete (globalThis as { window?: unknown }).window;
	});

	it('reads null when no anchor is stored', () => {
		withStorage();
		expect(readTillAnchor()).toBeNull();
	});

	it('round-trips write → read → clear under its key', () => {
		const store = withStorage();
		expect(writeTillAnchor('till-1')).toBe(true);
		expect(store.get(TILL_ANCHOR_KEY)).toBe('till-1');
		expect(readTillAnchor()).toBe('till-1');
		clearTillAnchor();
		expect(readTillAnchor()).toBeNull();
	});

	it("reads 'unknown' when storage throws — an unreadable anchor is not an absent one", () => {
		(globalThis as { window?: unknown }).window = {
			get localStorage(): Storage {
				throw new DOMException('denied', 'SecurityError');
			},
		};
		expect(readTillAnchor()).toBe('unknown');
		expect(() => clearTillAnchor()).not.toThrow();
	});

	it('reports failure instead of throwing when the write is rejected', () => {
		(globalThis as { window?: unknown }).window = {
			localStorage: {
				setItem: () => {
					throw new DOMException('quota exceeded', 'QuotaExceededError');
				},
			},
		};
		expect(writeTillAnchor('till-1')).toBe(false);
	});
});
