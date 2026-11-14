import { MoneyCommandError } from '@wcpos/query';

import type { ServerLegDeps } from './server/server-leg';

type LegError = { code: string; message: string } | null;

// How long a leg waits to retry its cleanup (the void, the retirement): the status cadence.
export const RETIRE_RETRY_MS = 2000;

/** The reason the poster refused a command before it left the till: nothing reached the store. */
export function refusedBeforeSend(error: unknown): LegError {
	return error instanceof MoneyCommandError &&
		(error.reason === 'order_changed' || error.reason === 'preflight_failed')
		? { code: error.reason, message: error.message }
		: null;
}

/** Only an intent so refused ends its leg (it never ran); after it, the authorization is live. */
export function terminalBeforeSend(route: string, error: unknown) {
	return route === 'intent' ? refusedBeforeSend(error) : null;
}

/**
 * The one finality rule of both legs (ADR 0040 §1.3): never final while the intent is unanswered
 * and unretired, or a recovery could re-send it into a payment nothing collects. Once the store
 * shows no live intent stands, `settle` retires `intent`, retrying with `retire_failed` shown, and
 * resolves true when the leg may publish finality; `settling` freezes the leg meanwhile.
 */
export function legFinality(
	deps: Pick<ServerLegDeps, 'retire' | 'setTimeout' | 'clearTimeout'>,
	live: () => { error: LegError } | null, // the leg's state; null once it is stopped
	set: (changes: { error: LegError }) => void
) {
	const stopped = () => live() === null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const gate = {
		intent: null as string | null,
		settling: false,
		wait: (ms: number) => new Promise<void>((resolve) => (timer = deps.setTimeout(resolve, ms))),
		stop: () => timer && deps.clearTimeout(timer),
		async settle() {
			gate.settling = true;
			const shown = live()?.error ?? null;
			while (gate.intent !== null && deps.retire && !stopped()) {
				try {
					await deps.retire('intent', gate.intent);
					set({ error: shown });
					break;
				} catch (error) {
					const message = error instanceof Error ? error.message : 'retire_failed';
					if (!stopped()) set({ error: { code: 'retire_failed', message } });
					await gate.wait(RETIRE_RETRY_MS);
				}
			}
			if (stopped()) return false;
			gate.intent = null;
			gate.settling = false;
			return true;
		},
	};
	return gate;
}
