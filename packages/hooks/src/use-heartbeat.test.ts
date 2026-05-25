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
			jest.advanceTimersByTime(1000);
		});
		expect(onHeartbeat).toHaveBeenCalledTimes(1);

		rerender({ emitFrequency: 1000 });

		act(() => {
			jest.advanceTimersByTime(1000);
		});
		expect(onHeartbeat).toHaveBeenCalledTimes(2);
	});
});
