/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { isVerboseDiagnostics } from '@wcpos/utils/logger';

import { useVerboseDiagnostics } from './use-verbose-diagnostics';

describe('useVerboseDiagnostics', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it('refreshes the displayed state after the persisted verbose flag expires', () => {
		let persistedVerbose = true;
		jest.mocked(isVerboseDiagnostics).mockImplementation(() => persistedVerbose);

		const { result } = renderHook(() => useVerboseDiagnostics());
		expect(result.current.verbose).toBe(true);

		persistedVerbose = false;
		act(() => {
			jest.advanceTimersByTime(60_000);
		});

		expect(result.current.verbose).toBe(false);
	});
});
