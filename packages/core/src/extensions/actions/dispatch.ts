import {
	ACTION_BUDGET_MS,
	ACTION_HOOK_STRIKES,
	getActionHooks,
	getActionHookState,
	isDispatchToken,
	recordActionHookStrike,
} from './registry';
import { isActionRefusal, REWRITABLE_PAYLOAD_KEYS } from './types';

import type { DispatchToken } from './registry';
import type {
	ActionContext,
	ActionEvent,
	ActionEventInput,
	ActionHookTier,
	ActionNext,
	ActionRefusal,
	ActionResult,
} from './types';

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object') {
		Object.values(value).forEach(deepFreeze);
		Object.freeze(value);
	}
	return value;
}
function clone<T>(value: T): T {
	return deepFreeze(JSON.parse(JSON.stringify(value)));
}

export async function dispatchAction<E extends ActionEvent>({
	event,
	input,
	token,
	ctx,
	bottom,
}: {
	event: E;
	input: Omit<ActionEventInput<E>, 'event'>;
	token: DispatchToken;
	ctx: ActionContext;
	bottom: (e: ActionEventInput<E>) => Promise<ActionResult<E>>;
}): Promise<ActionResult<E> | ActionRefusal> {
	if (!isDispatchToken(token))
		throw new Error('dispatchAction must run inside enqueueOrderMutation');
	const hooks = getActionHooks(event);
	// One budget per TIER, started when that tier's first hook runs: extensions run first and
	// must never be able to spend the guards' time (a slow extension that starved a guard into a
	// timeout would be an extension veto). Hook latency before the writer is bounded by two
	// budgets; after-work budgets (below) add one per hook that called `next`.
	const deadlines: Partial<Record<ActionHookTier, number>> = {};
	const deadlineFor = (tier: ActionHookTier) =>
		(deadlines[tier] ??= ctx.now() + ACTION_BUDGET_MS[event]);
	const timers = new Set<ReturnType<typeof setTimeout>>();
	let reachedBottom = false;
	let writerFailed = false;
	let writerError: unknown;
	const run: ActionNext<E> = async (iEvent) => runAt(0, iEvent);
	async function runAt(i: number, e: ActionEventInput<E>): Promise<ActionResult<E>> {
		if (i === hooks.length) {
			reachedBottom = true;
			timers.forEach(clearTimeout);
			try {
				return await bottom(e);
			} catch (error) {
				writerFailed = true;
				writerError = error;
				throw error;
			}
		}
		const { id: hookId, tier, hook } = hooks[i];
		if (getActionHookState(hookId).disabled) {
			// A guard disabled since this dispatch took its hook list fails closed; an extension
			// disabled in the meantime (a dispatch for another order struck it) is skipped, as
			// getActionHooks would have skipped it — a refusal from it would be an extension veto.
			if (tier === 'guard')
				return deepFreeze({
					deny: { reasonKey: 'actions.hook_disabled', detail: { hookId, event } },
				});
			return runAt(i + 1, e);
		}
		let nextCalled = false;
		let settled = false;
		let inner: Promise<ActionResult<E>> | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = Symbol('timeout');
		let rejectRace: (reason: unknown) => void = () => undefined;
		const next: ActionNext<E> = (rewrite) => {
			if (nextCalled) throw new Error('next called twice');
			if (settled) return Promise.resolve(undefined); // Late next cannot write after refusal/skip.
			const payload = { ...e.payload };
			for (const key of REWRITABLE_PAYLOAD_KEYS[event]) {
				if (key in rewrite.payload)
					Object.assign(payload, { [key]: rewrite.payload[key as keyof typeof rewrite.payload] });
			}
			// Clone before anything is recorded: a rewrite that cannot be cloned (a cycle, a
			// BigInt) throws into the hook as any other hook error, with `next` not yet called.
			const rewritten = clone({ ...e, payload });
			nextCalled = true;
			// From here the hook is waiting on the chain beneath it, whose hooks keep their own
			// timers against the same deadline: a timeout now would be theirs, not this hook's.
			if (timer !== undefined) {
				clearTimeout(timer);
				timers.delete(timer);
				timer = undefined;
			}
			inner = runAt(i + 1, rewritten);
			// After-work (what the hook does once the chain beneath has answered) gets a budget
			// of its own, so a hook that never returns cannot leave the dispatch, and the order's
			// queue behind it, pending forever. On timeout the inner answer stands.
			inner.then(startAfterTimer, startAfterTimer);
			return inner;
		};
		const startAfterTimer = () => {
			if (settled || timer !== undefined) return;
			timer = setTimeout(() => rejectRace(timeout), ACTION_BUDGET_MS[event]);
			timers.add(timer);
		};
		let reason: string;
		let failure: unknown;
		try {
			const pending = hook(ctx, e, next);
			// A hook that outlives the budget keeps running; its later rejection is nobody's.
			pending.catch(() => undefined);
			const value = await Promise.race([
				pending,
				new Promise<never>((_, reject) => {
					rejectRace = reject;
					// A hook that already called `next` (synchronously, before its first await) is
					// waiting on the chain beneath it and gets no timer of its own.
					if (!reachedBottom && !nextCalled) {
						timer = setTimeout(() => reject(timeout), Math.max(0, deadlineFor(tier) - ctx.now()));
						timers.add(timer);
					}
				}),
			]);
			if (nextCalled) {
				// Once `next` was called, what the chain beneath answered IS the dispatch's answer:
				// a hook's return after `next` is ignored, so an after-hook can neither replace a
				// guard's refusal with a value of its own nor lose it by forgetting `return`. The
				// writer may still be running when the hook returns, so the dispatch settles only
				// once the inner chain has, and a writer error is the caller's: it propagates.
				const innerValue = await inner;
				if (!isActionRefusal(value) || value === innerValue) return innerValue;
				// A refusal of the hook's own after the chain beneath it answered: the writer may
				// have written, so it is a failure, and the inner answer stands.
				reason = 'deny_after_next';
			} else if (isActionRefusal(value)) {
				// Cloned, then frozen on the way out: no hook above can edit the refusal in place,
				// and nothing the guard put in `detail` is frozen under it.
				if (tier === 'guard') return clone(value);
				ctx.log('warn', 'Extension hook refusal ignored', { context: { hookId, event } });
				return runAt(i + 1, e);
			} else reason = 'returned_without_next';
		} catch (error) {
			if (writerFailed && error === writerError) throw error;
			reason = error === timeout ? 'timeout' : 'threw';
			failure = error === timeout ? undefined : error;
		} finally {
			settled = true;
			if (timer !== undefined) {
				clearTimeout(timer);
				timers.delete(timer);
			}
		}
		const state = recordActionHookStrike(hookId, reason);
		// Every strike leaves a row: a refused sale with no trace is the failure mode a till
		// cannot afford, and only the third strike used to be logged.
		ctx.log('warn', 'Action hook failed', {
			context: {
				hookId,
				event,
				reason,
				strikes: state.strikes,
				error:
					failure instanceof Error
						? failure.message
						: failure === undefined
							? undefined
							: String(failure),
			},
		});
		if (state.strikes === ACTION_HOOK_STRIKES)
			ctx.log('warn', 'Action hook disabled for this session', {
				context: { hookId, event, strikes: state.strikes },
			});
		if (nextCalled) return inner;
		return tier === 'extension'
			? runAt(i + 1, e)
			: deepFreeze({
					deny: {
						reasonKey: reason === 'timeout' ? 'actions.hook_timeout' : 'actions.hook_failed',
						detail: { hookId, event },
					},
				});
	}
	return run(clone({ ...input, event }));
}
