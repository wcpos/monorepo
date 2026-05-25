/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { useSubscription } from 'observable-hooks';

import { useHeartbeatObservable } from './use-heartbeat';

function useHeartbeatSpy(emitFrequency: number, onHeartbeat: jest.Mock) {
	useSubscription(useHeartbeatObservable(emitFrequency), onHeartbeat);
}

describe('useHeartbeatObservable', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('uses the latest emit frequency after rerender', () => {
		const onHeartbeat = jest.fn();
		const { rerender } = renderHook(
			({ emitFrequency }) => useHeartbeatSpy(emitFrequency, onHeartbeat),
			{ initialProps: { emitFrequency: 2000 } }
		);

		act(() => {
			jest.advanceTimersByTime(1999);
		});
		expect(onHeartbeat).not.toHaveBeenCalled();

		act(() => {
			jest.advanceTimersByTime(1);
		});
		expect(onHeartbeat).toHaveBeenCalledTimes(1);

		rerender({ emitFrequency: 1000 });

		act(() => {
			jest.advanceTimersByTime(999);
		});
		expect(onHeartbeat).toHaveBeenCalledTimes(1);

		act(() => {
			jest.advanceTimersByTime(1);
		});
		expect(onHeartbeat).toHaveBeenCalledTimes(2);
	});

	it('supports non-multiple-of-1000 emit frequencies after rerender', () => {
		const onHeartbeat = jest.fn();
		const { rerender } = renderHook(
			({ emitFrequency }) => useHeartbeatSpy(emitFrequency, onHeartbeat),
			{ initialProps: { emitFrequency: 1500 } }
		);

		act(() => {
			jest.advanceTimersByTime(1499);
		});
		expect(onHeartbeat).not.toHaveBeenCalled();

		act(() => {
			jest.advanceTimersByTime(1);
		});
		expect(onHeartbeat).toHaveBeenCalledTimes(1);

		rerender({ emitFrequency: 750 });

		act(() => {
			jest.advanceTimersByTime(749);
		});
		expect(onHeartbeat).toHaveBeenCalledTimes(1);

		act(() => {
			jest.advanceTimersByTime(1);
		});
		expect(onHeartbeat).toHaveBeenCalledTimes(2);

		act(() => {
			jest.advanceTimersByTime(750);
		});
		expect(onHeartbeat).toHaveBeenCalledTimes(3);
	});

	it.each([0, -1, NaN, Infinity])('throws for invalid emit frequency %s', (emitFrequency) => {
		const onHeartbeat = jest.fn();

		expect(() => {
			renderHook(() => useHeartbeatSpy(emitFrequency, onHeartbeat));
		}).toThrow(`emitFrequency must be a positive finite number, got: ${emitFrequency}`);
	});
});
