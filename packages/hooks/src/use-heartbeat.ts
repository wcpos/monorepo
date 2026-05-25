import { useObservable, useSubscription } from 'observable-hooks';
import { interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/**
 * Custom hook to use the global heartbeat with configurable intervals.
 *
 * @param {number} emitFrequency - Frequency in milliseconds at which the component should receive updates.
 * @returns An Observable that emits values at the specified frequency.
 */
export const useHeartbeatObservable = (emitFrequency: number) => {
	if (!Number.isFinite(emitFrequency) || emitFrequency <= 0) {
		throw new Error(`emitFrequency must be a positive finite number, got: ${emitFrequency}`);
	}

	const heartbeat$ = useObservable(
		(inputs$) => inputs$.pipe(switchMap(([frequency]) => interval(frequency))),
		[emitFrequency]
	);

	return heartbeat$;
};

/**
 * Custom hook to use the global heartbeat with configurable intervals.
 *
 * @param emitFrequency
 * @param callback
 */
export const useHeartbeatCallback = (emitFrequency: number, callback: () => void) => {
	const heartbeat$ = useHeartbeatObservable(emitFrequency);

	useSubscription(heartbeat$, callback);
};
