import {
	CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY,
	scheduleClearLocalDataOnNextLoad,
} from './clear-local-data-flag';

describe('scheduleClearLocalDataOnNextLoad', () => {
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
});
