import { afterEach, describe, expect, it, vi } from 'vitest';

import { systemTimers } from './engine-timers';

describe('systemTimers', () => {
	afterEach(() => vi.restoreAllMocks());

	it('delegates to the current global timer functions lazily', () => {
		const handle = 17 as unknown as ReturnType<typeof setTimeout>;
		const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(handle);
		const callback = vi.fn();

		expect(systemTimers.setTimeout(callback, 25)).toBe(handle);
		expect(setTimeoutSpy).toHaveBeenCalledWith(callback, 25);
	});
});
