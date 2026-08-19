import {
	CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY,
	readClearLocalDataOnNextLoadFlag,
	scheduleClearLocalDataOnNextLoad,
	unscheduleClearLocalDataOnNextLoad,
} from './clear-local-data-flag.web';

describe('clear-local-data-flag (web)', () => {
	afterEach(() => {
		delete (globalThis as { window?: unknown }).window;
	});

	it('sets the reset flag and reports success', () => {
		const setItem = jest.fn();
		(globalThis as { window?: unknown }).window = { localStorage: { setItem } };

		expect(scheduleClearLocalDataOnNextLoad()).toBe(true);
		expect(setItem).toHaveBeenCalledWith(CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY, '1');
	});

	it('reports failure instead of throwing when the flag write is rejected', () => {
		const setItem = jest.fn(() => {
			throw new DOMException('quota exceeded', 'QuotaExceededError');
		});
		(globalThis as { window?: unknown }).window = { localStorage: { setItem } };

		expect(scheduleClearLocalDataOnNextLoad()).toBe(false);
	});

	it('reports failure when storage access itself throws', () => {
		(globalThis as { window?: unknown }).window = {
			get localStorage(): Storage {
				throw new DOMException('denied', 'SecurityError');
			},
		};

		expect(scheduleClearLocalDataOnNextLoad()).toBe(false);
	});

	it('round-trips schedule → read → unschedule against real storage semantics', () => {
		const store = new Map<string, string>();
		(globalThis as { window?: unknown }).window = {
			localStorage: {
				setItem: (key: string, value: string) => store.set(key, value),
				getItem: (key: string) => store.get(key) ?? null,
				removeItem: (key: string) => store.delete(key),
			},
		};

		expect(readClearLocalDataOnNextLoadFlag()).toBe('not-scheduled');
		expect(scheduleClearLocalDataOnNextLoad()).toBe(true);
		expect(readClearLocalDataOnNextLoadFlag()).toBe('scheduled');
		unscheduleClearLocalDataOnNextLoad();
		expect(readClearLocalDataOnNextLoadFlag()).toBe('not-scheduled');
	});

	it("reads report 'not-scheduled' when storage is unavailable — a sandbox that cannot read the flag also cannot arm it", () => {
		expect(readClearLocalDataOnNextLoadFlag()).toBe('not-scheduled');
		expect(() => unscheduleClearLocalDataOnNextLoad()).not.toThrow();
	});
});
