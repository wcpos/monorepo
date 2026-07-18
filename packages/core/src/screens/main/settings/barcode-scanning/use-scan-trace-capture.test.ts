/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useScanTraceCapture } from './use-scan-trace-capture';

jest.mock('@wcpos/hooks/use-hotkeys', () => ({
	useHotkeys: jest.fn(),
	getKeyFromEvent: (event: { key: string }) => event.key,
}));

describe('useScanTraceCapture', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(0);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('finalizes an attempt after the settle timeout', () => {
		const { result } = renderHook(() => useScanTraceCapture());

		act(() => {
			result.current.recordKey('9', 1000);
			result.current.recordKey('3', 1013);
			result.current.recordKey('1', 1026);
		});
		expect(result.current.currentKeys).toHaveLength(3);
		expect(result.current.attempts).toHaveLength(0);

		act(() => {
			jest.advanceTimersByTime(400);
		});

		expect(result.current.currentKeys).toHaveLength(0);
		expect(result.current.attempts).toHaveLength(1);
		expect(result.current.attempts[0].map((entry) => entry.key).join('')).toBe('931');
	});

	it('starts a new attempt when the gap exceeds 1000ms', () => {
		const { result } = renderHook(() => useScanTraceCapture());

		act(() => {
			result.current.recordKey('A', 1000);
			result.current.recordKey('B', 1010);
			// long pause — belongs to the next attempt
			result.current.recordKey('C', 3000);
		});

		expect(result.current.attempts).toHaveLength(1);
		expect(result.current.attempts[0].map((entry) => entry.key).join('')).toBe('AB');
		expect(result.current.currentKeys.map((entry) => entry.key).join('')).toBe('C');
	});

	it('caps history at five attempts, newest first', () => {
		const { result } = renderHook(() => useScanTraceCapture());

		act(() => {
			for (let index = 0; index < 7; index += 1) {
				result.current.recordKey(String(index), index * 2000);
			}
			jest.advanceTimersByTime(400);
		});

		expect(result.current.attempts).toHaveLength(5);
		expect(result.current.attempts[0][0].key).toBe('6');
	});

	it('records keys from a native onKeyPress event', () => {
		const { result } = renderHook(() => useScanTraceCapture());

		act(() => {
			result.current.onKeyPress({ nativeEvent: { key: '7' } } as never);
			result.current.onKeyPress({ nativeEvent: { key: '3' } } as never);
		});

		expect(result.current.currentKeys.map((entry) => entry.key).join('')).toBe('73');
	});

	it('reset clears attempts and the current trace', () => {
		const { result } = renderHook(() => useScanTraceCapture());

		act(() => {
			result.current.recordKey('X', 1000);
			jest.advanceTimersByTime(400);
			result.current.recordKey('Y', 2000);
			result.current.reset();
		});

		expect(result.current.currentKeys).toHaveLength(0);
		expect(result.current.attempts).toHaveLength(0);
	});
});
