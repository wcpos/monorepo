import { useObservable, useSubscription } from 'observable-hooks';
import { interval } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';

// Global heartbeat observable that emits every second
const secondTimer$ = interval(1000);

/**
 * Custom hook to use the global heartbeat with configurable intervals.
 *
 * @param {number} emitFrequency - Frequency in milliseconds at which the component should receive updates.
 * @returns An Observable that emits values at the specified frequency.
 */
export const useHeartbeatObservable = (emitFrequency: number) => {
	const heartbeat$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([frequency]) =>
					secondTimer$.pipe(filter((_, index) => index % (frequency / 1000) === 0))
				)
			),
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
