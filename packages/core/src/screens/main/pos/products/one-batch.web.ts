import { flushSync } from 'react-dom';

/**
 * Run `update` so every state update inside it lands in ONE render, whoever calls it (see the
 * batching invariant at `useBrowsePath`'s `enter`): outside a discrete event, a
 * `useSyncExternalStore` write renders at sync priority before a `useState` update does.
 */
export function inOneBatch(update: () => void): void {
	flushSync(update);
}
