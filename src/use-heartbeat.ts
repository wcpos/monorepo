import { useObservable, useSubscription } from 'observable-hooks';
import { interval } from 'rxjs';
import { filter } from 'rxjs/operators';

// Global heartbeat observable that emits every second
const secondTimer$ = interval(1000);

/**
 * Custom hook to use the global heartbeat with configurable intervals.
 *
 * @param {number} emitFrequency - Frequency in milliseconds at which the component should receive updates.
 * @returns An Observable that emits values at the specified frequency.
 */
export const useHeartbeatObservable = (emitFrequency: number) => {
	const heartbeat$ = useObservable(() =>
		secondTimer$.pipe(filter((_, index) => index % (emitFrequency / 1000) === 0))
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
