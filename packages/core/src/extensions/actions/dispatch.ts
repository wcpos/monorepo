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
	const deadline = ctx.now() + ACTION_BUDGET_MS[event];
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
				return { deny: { reasonKey: 'actions.hook_disabled', detail: { hookId, event } } };
			return runAt(i + 1, e);
		}
		let nextCalled = false;
		let settled = false;
		let inner: Promise<ActionResult<E>> | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = Symbol('timeout');
		const next: ActionNext<E> = (rewrite) => {
			if (nextCalled) throw new Error('next called twice');
			if (settled) return Promise.resolve(undefined); // Late next cannot write after refusal/skip.
			const payload = { ...e.payload };
			for (const key of REWRITABLE_PAYLOAD_KEYS[event]) {
				if (key in rewrite.payload)
					Object.assign(payload, { [key]: rewrite.payload[key as keyof typeof rewrite.payload] });
			}
			nextCalled = true;
			inner = runAt(i + 1, clone({ ...e, payload }));
			return inner;
		};
		let reason: string;
		try {
			const pending = hook(ctx, e, next);
			// A hook that outlives the budget keeps running; its later rejection is nobody's.
			pending.catch(() => undefined);
			const value = await Promise.race([
				pending,
				new Promise<never>((_, reject) => {
					if (!reachedBottom) {
						timer = setTimeout(() => reject(timeout), Math.max(0, deadline - ctx.now()));
						timers.add(timer);
					}
				}),
			]);
			if (nextCalled) {
				// The writer may still be running when a hook returns without awaiting `next`:
				// the dispatch settles only once the inner chain has, and a writer error is the
				// caller's, so it propagates from here.
				const innerValue = await inner;
				if (!isActionRefusal(value) || value === innerValue) return value;
				// A refusal of the hook's own, after the chain beneath it answered: the writer may
				// have written, so the refusal is a failure and the inner answer stands. Passing
				// on the refusal an inner guard returned is not that: it is the same value.
				reason = 'deny_after_next';
			} else if (isActionRefusal(value)) {
				if (tier === 'guard') return value;
				ctx.log('warn', 'Extension hook refusal ignored', { context: { hookId, event } });
				return runAt(i + 1, e);
			} else reason = 'returned_without_next';
		} catch (error) {
			if (writerFailed && error === writerError) throw error;
			reason = error === timeout ? 'timeout' : 'threw';
		} finally {
			settled = true;
			if (timer !== undefined) {
				clearTimeout(timer);
				timers.delete(timer);
			}
		}
		const state = recordActionHookStrike(hookId, reason);
		if (state.strikes === ACTION_HOOK_STRIKES)
			ctx.log('warn', 'Action hook disabled for this session', {
				context: { hookId, event, strikes: state.strikes },
			});
		if (nextCalled) return inner;
		return tier === 'extension'
			? runAt(i + 1, e)
			: {
					deny: {
						reasonKey: reason === 'timeout' ? 'actions.hook_timeout' : 'actions.hook_failed',
						detail: { hookId, event },
					},
				};
	}
	return run(clone({ event, ...input }));
}
