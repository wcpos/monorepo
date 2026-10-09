import { createActionContext } from './context';
import { dispatchAction } from './dispatch';
import { presentActionRefusal } from './present';
import {
	createDispatchToken,
	getActionHookState,
	registerActionHook,
	resetActionRegistry,
} from './registry';

import type { ActionEventInput, ActionHook, ActionHookTier } from './types';

const denial = { deny: { reasonKey: 'no_stock' } };
const input: Omit<ActionEventInput<'cart.line.add'>, 'event'> = {
	orderId: 'order',
	actor: { userId: 7, registerId: 'register', sessionId: null },
	source: 'user',
	payload: { type: 'line_items', line: { quantity: 1 }, lineItems: [] },
};
const log = jest.fn();
const bottom = jest.fn();
const ctx = createActionContext({
	log,
	t: (key) => key,
	readCatalog: async () => null,
	preventOverselling: true,
	resolveSession: async () => ({ registerId: null, sessionId: null }),
});
const dispatch = () =>
	dispatchAction({ event: 'cart.line.add', input, ctx, token: createDispatchToken(), bottom });
const register = (hook: ActionHook<'cart.line.add'>, tier: ActionHookTier = 'guard') =>
	registerActionHook('cart.line.add', hook, { id: 'test.hook', tier });
beforeEach(() => {
	resetActionRegistry();
	jest.clearAllMocks();
	bottom.mockResolvedValue('saved');
});
afterEach(() => jest.useRealTimers());

it('ignores an extension refusal, logs it and continues', async () => {
	register(async () => denial, 'extension');
	expect(await dispatch()).toBe('saved');
	expect(bottom).toHaveBeenCalledTimes(1);
	expect(log).toHaveBeenCalledWith('warn', 'Extension hook refusal ignored', {
		context: { hookId: 'test.hook', event: 'cart.line.add' },
	});
	expect(getActionHookState('test.hook').strikes).toBe(0);
});
it('stops at a guard refusal without calling bottom', async () => {
	register(async () => denial);
	expect(await dispatch()).toEqual(denial);
	expect(bottom).not.toHaveBeenCalled();
});
it('strikes a deny after next and keeps the inner result', async () => {
	register(async (_, e, next) => {
		await next(e);
		return denial;
	});
	expect(await dispatch()).toBe('saved');
	expect(getActionHookState('test.hook').strikes).toBe(1);
});
it('refuses a timed-out guard', async () => {
	jest.useFakeTimers();
	register(async () => new Promise(() => undefined));
	const result = dispatch();
	await jest.advanceTimersByTimeAsync(1500);
	expect(await result).toEqual({
		deny: {
			reasonKey: 'actions.hook_timeout',
			detail: { hookId: 'test.hook', event: 'cart.line.add' },
		},
	});
	expect(bottom).not.toHaveBeenCalled();
});
it('skips a timed-out extension', async () => {
	jest.useFakeTimers();
	register(async () => new Promise(() => undefined), 'extension');
	const result = dispatch();
	await jest.advanceTimersByTimeAsync(1500);
	expect(await result).toBe('saved');
});
it('refuses a throwing guard', async () => {
	register(async () => {
		throw new Error('broken');
	});
	expect(await dispatch()).toEqual({
		deny: {
			reasonKey: 'actions.hook_failed',
			detail: { hookId: 'test.hook', event: 'cart.line.add' },
		},
	});
	expect(bottom).not.toHaveBeenCalled();
});
it('disables after the third strike, logging every strike and the disabling, skipping the hook on later dispatches', async () => {
	const hook = jest.fn(async () => {
		throw new Error('broken');
	});
	register(hook, 'extension');
	await dispatch();
	await dispatch();
	await dispatch();
	expect(await dispatch()).toBe('saved');
	expect(hook).toHaveBeenCalledTimes(3);
	// One row per strike, then the disabled row.
	expect(log).toHaveBeenCalledTimes(4);
	expect(log).toHaveBeenNthCalledWith(1, 'warn', 'Action hook failed', {
		context: {
			hookId: 'test.hook',
			event: 'cart.line.add',
			reason: 'threw',
			strikes: 1,
			error: 'broken',
		},
	});
	expect(log).toHaveBeenCalledWith('warn', 'Action hook disabled for this session', {
		context: { hookId: 'test.hook', event: 'cart.line.add', strikes: 3 },
	});
});
it('freezes cloned nested data without freezing caller objects', async () => {
	register(async (_, e, next) => {
		expect(Object.isFrozen(e)).toBe(true);
		expect(() => {
			e.payload.line.quantity = 2;
		}).toThrow(TypeError);
		return next(e);
	});
	await dispatch();
	expect(Object.isFrozen(input.payload.line)).toBe(false);
	expect(input.payload.line.quantity).toBe(1);
});
it('honours the allowed rewrite but discards all other changed keys', async () => {
	register(async (_, e, next) =>
		next({
			...e,
			orderId: 'wrong',
			source: 'system',
			actor: { ...e.actor, userId: 99 },
			payload: { type: 'fee_lines', line: { quantity: 3 }, lineItems: [{ quantity: 99 }] },
		})
	);
	await dispatch();
	expect(bottom).toHaveBeenCalledWith({
		event: 'cart.line.add',
		...input,
		payload: { ...input.payload, line: { quantity: 3 } },
	});
});
it('throws next called twice into the hook', async () => {
	register(async (_, e, next) => {
		const result = next(e);
		expect(() => next(e)).toThrow('next called twice');
		return result;
	});
	expect(await dispatch()).toBe('saved');
	expect(bottom).toHaveBeenCalledTimes(1);
});
it('rejects a foreign dispatch token', async () => {
	await expect(
		dispatchAction({
			event: 'cart.line.add',
			input,
			ctx,
			bottom,
			token: {} as ReturnType<typeof createDispatchToken>,
		})
	).rejects.toThrow('dispatchAction must run inside enqueueOrderMutation');
	expect(bottom).not.toHaveBeenCalled();
});
it('passes replay source to hooks', async () => {
	const hook = jest.fn<
		ReturnType<ActionHook<'cart.line.add'>>,
		Parameters<ActionHook<'cart.line.add'>>
	>();
	hook.mockImplementation(async (_, e, next) => next(e));
	register(hook);
	await dispatchAction({
		event: 'cart.line.add',
		input: { ...input, source: 'replay' },
		ctx,
		bottom,
		token: createDispatchToken(),
	});
	expect(hook.mock.calls[0][1].source).toBe('replay');
});
it('propagates the bottom rejection unchanged without striking a passing hook', async () => {
	const error = new Error('writer failed');
	bottom.mockRejectedValue(error);
	register(async (_, e, next) => next(e));
	await expect(dispatch()).rejects.toBe(error);
	expect(getActionHookState('test.hook').strikes).toBe(0);
});
it.each(['guard', 'extension'] as const)('handles %s returning without next', async (tier) => {
	register(async () => 'not written', tier);
	const result = await dispatch();
	expect(result).toEqual(
		tier === 'guard'
			? {
					deny: {
						reasonKey: 'actions.hook_failed',
						detail: { hookId: 'test.hook', event: 'cart.line.add' },
					},
				}
			: 'saved'
	);
	expect(getActionHookState('test.hook').strikes).toBe(1);
});
it('does not count bottom time against the hook budget', async () => {
	jest.useFakeTimers();
	bottom.mockImplementation(
		() => new Promise((resolve) => setTimeout(() => resolve('saved'), 3000))
	);
	register(async (_, e, next) => next(e));
	const result = dispatch();
	await jest.advanceTimersByTimeAsync(3000);
	expect(await result).toBe('saved');
	expect(getActionHookState('test.hook').strikes).toBe(0);
});
it('never lets a timed-out hook call bottom later', async () => {
	jest.useFakeTimers();
	register(async (_, e, next) => {
		await new Promise((resolve) => setTimeout(resolve, 2000));
		return next(e);
	});
	const result = dispatch();
	await jest.advanceTimersByTimeAsync(1500);
	await result;
	await jest.advanceTimersByTimeAsync(500);
	expect(bottom).not.toHaveBeenCalled();
});
it('keeps the inner result when a hook throws after next', async () => {
	register(async (_, e, next) => {
		await next(e);
		throw new Error('after');
	});
	expect(await dispatch()).toBe('saved');
	expect(getActionHookState('test.hook').strikes).toBe(1);
});

it('does not strike an outer guard that passes on an inner guard refusal', async () => {
	let allow = false;
	registerActionHook('cart.line.add', async (_, e, next) => next(e), {
		id: 'outer.guard',
		tier: 'guard',
		order: 0,
	});
	registerActionHook('cart.line.add', async (_, e, next) => (allow ? next(e) : denial), {
		id: 'inner.guard',
		tier: 'guard',
		order: 1,
	});
	for (let i = 0; i < 3; i++) expect(await dispatch()).toEqual(denial);
	expect(getActionHookState('outer.guard').strikes).toBe(0);
	allow = true;
	expect(await dispatch()).toBe('saved');
});
it('skips, rather than refuses for, an extension disabled while a dispatch was in flight', async () => {
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	// The hold sits in an extension that runs BEFORE the flaky one, so the in-flight dispatch
	// reaches the flaky entry only after other dispatches have struck it out.
	registerActionHook(
		'cart.line.add',
		async (_, e, next) => {
			if (e.payload.line.hold === true) await held;
			return next(e);
		},
		{ id: 'holding.extension', tier: 'extension', order: 0 }
	);
	registerActionHook(
		'cart.line.add',
		async () => {
			throw new Error('broken');
		},
		{ id: 'flaky.extension', tier: 'extension', order: 1 }
	);
	const inFlight = dispatchAction({
		event: 'cart.line.add',
		input: { ...input, payload: { ...input.payload, line: { quantity: 1, hold: true } } },
		ctx,
		bottom,
		token: createDispatchToken(),
	});
	// Three dispatches for other orders strike the extension out while the first is held.
	await dispatch();
	await dispatch();
	await dispatch();
	expect(getActionHookState('flaky.extension').disabled).toBe(true);
	release();
	expect(await inFlight).toBe('saved');
});
it('waits for the writer when a hook returns without awaiting next, and surfaces its error', async () => {
	const error = new Error('writer failed');
	bottom.mockRejectedValue(error);
	register(async (_, e, next) => {
		void next(e);
		return 'own value';
	});
	await expect(dispatch()).rejects.toBe(error);
	bottom.mockResolvedValue('saved');
	// The chain's answer stands; the hook's own return after `next` is ignored.
	expect(await dispatch()).toBe('saved');
	expect(bottom).toHaveBeenCalledTimes(2);
});
it('does not strike a guard that is only waiting on next while an inner hook times out', async () => {
	jest.useFakeTimers();
	// Extensions run first now, so the slow hook here is an inner guard beneath a waiting one.
	registerActionHook('cart.line.add', async (_, e, next) => next(e), {
		id: 'waiting.guard',
		tier: 'guard',
		order: 0,
	});
	registerActionHook('cart.line.add', async () => new Promise(() => undefined), {
		id: 'slow.guard',
		tier: 'guard',
		order: 1,
	});
	const result = dispatch();
	await jest.advanceTimersByTimeAsync(1500);
	expect(await result).toEqual({
		deny: {
			reasonKey: 'actions.hook_timeout',
			detail: { hookId: 'slow.guard', event: 'cart.line.add' },
		},
	});
	expect(getActionHookState('waiting.guard').strikes).toBe(0);
	expect(getActionHookState('slow.guard').strikes).toBe(1);
});
it('lets a guard judge the payload after an extension rewrote it', async () => {
	registerActionHook(
		'cart.line.add',
		async (_, e, next) => next({ ...e, payload: { ...e.payload, line: { quantity: 100 } } }),
		{ id: 'greedy.extension', tier: 'extension' }
	);
	registerActionHook(
		'cart.line.add',
		async (_, e, next) => ((e.payload.line.quantity as number) > 10 ? denial : next(e)),
		{ id: 'stock.guard', tier: 'guard' }
	);
	expect(await dispatch()).toEqual(denial);
	expect(bottom).not.toHaveBeenCalled();
});
it('does not let a hook replace a context noun', async () => {
	register(async (ctx, e, next) => {
		expect(() => {
			(ctx.read as { catalog: unknown }).catalog = async () => ({ hacked: true });
		}).toThrow(TypeError);
		return next(e);
	});
	expect(await dispatch()).toBe('saved');
});
it('gives a hook that calls next synchronously no timer of its own', async () => {
	jest.useFakeTimers();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	// Calls next before its first await, so next runs before the race's timer is created.
	registerActionHook('cart.line.add', (_, e, next) => next(e), {
		id: 'forwarding.guard',
		tier: 'guard',
		order: 0,
	});
	registerActionHook(
		'cart.line.add',
		async (_, e, next) => {
			await held;
			return next(e);
		},
		{ id: 'reading.guard', tier: 'guard', order: 1 }
	);
	const result = dispatch();
	await Promise.resolve();
	// One timer: the reading guard's. The forwarding guard, having called next, has none.
	expect(jest.getTimerCount()).toBe(1);
	await jest.advanceTimersByTimeAsync(1500);
	expect(getActionHookState('forwarding.guard').strikes).toBe(0);
	expect(await result).toEqual({
		deny: {
			reasonKey: 'actions.hook_timeout',
			detail: { hookId: 'reading.guard', event: 'cart.line.add' },
		},
	});
	release();
});
it('times out after-work that never returns, keeps the inner answer and strikes the hook', async () => {
	jest.useFakeTimers();
	register(async (_, e, next) => {
		await next(e);
		await new Promise(() => undefined);
		return 'never';
	});
	const result = dispatch();
	await jest.advanceTimersByTimeAsync(1500);
	expect(await result).toBe('saved');
	expect(bottom).toHaveBeenCalledTimes(1);
	expect(getActionHookState('test.hook').strikes).toBe(1);
});
it('treats a rewrite that cannot be cloned as a hook failure with next not called', async () => {
	const cyclic: Record<string, unknown> = {};
	cyclic.self = cyclic;
	register(async (_, e, next) => next({ ...e, payload: { ...e.payload, line: cyclic } }));
	expect(await dispatch()).toEqual({
		deny: {
			reasonKey: 'actions.hook_failed',
			detail: { hookId: 'test.hook', event: 'cart.line.add' },
		},
	});
	expect(bottom).not.toHaveBeenCalled();
	expect(getActionHookState('test.hook').strikes).toBe(1);
});
it('gives guards a budget of their own, so a slow extension cannot starve one', async () => {
	jest.useFakeTimers();
	registerActionHook(
		'cart.line.add',
		async (_, e, next) => {
			await new Promise((resolve) => setTimeout(resolve, 1400));
			return next(e);
		},
		{ id: 'slow.extension', tier: 'extension' }
	);
	registerActionHook(
		'cart.line.add',
		async (_, e, next) => {
			await new Promise((resolve) => setTimeout(resolve, 300));
			return next(e);
		},
		{ id: 'reading.guard', tier: 'guard' }
	);
	const result = dispatch();
	await jest.advanceTimersByTimeAsync(1700);
	expect(await result).toBe('saved');
	expect(getActionHookState('reading.guard').strikes).toBe(0);
	expect(getActionHookState('slow.extension').strikes).toBe(0);
});
it("keeps a guard's refusal when an extension's after-work returns something else or nothing", async () => {
	registerActionHook('cart.line.add', async () => denial, { id: 'stock.guard', tier: 'guard' });
	registerActionHook(
		'cart.line.add',
		async (_, e, next) => {
			await next(e);
			return 'looks saved';
		},
		{ id: 'careless.extension', tier: 'extension', order: 0 }
	);
	registerActionHook(
		'cart.line.add',
		(async (_, e, next) => {
			await next(e);
		}) as ActionHook<'cart.line.add'>,
		{ id: 'forgetful.extension', tier: 'extension', order: 1 }
	);
	expect(await dispatch()).toEqual(denial);
	expect(bottom).not.toHaveBeenCalled();
	expect(getActionHookState('careless.extension').strikes).toBe(0);
	expect(getActionHookState('forgetful.extension').strikes).toBe(0);
});
it('hands a guard refusal out frozen, so an extension cannot edit it in place', async () => {
	registerActionHook('cart.line.add', async () => ({ deny: { reasonKey: 'no_stock' } }), {
		id: 'stock.guard',
		tier: 'guard',
	});
	registerActionHook(
		'cart.line.add',
		async (_, e, next) => {
			const r = await next(e);
			expect(() => {
				(r as { deny: { reasonKey: string } }).deny.reasonKey = 'ok';
			}).toThrow(TypeError);
			return r;
		},
		{ id: 'tampering.extension', tier: 'extension' }
	);
	expect(await dispatch()).toEqual({ deny: { reasonKey: 'no_stock' } });
	expect(bottom).not.toHaveBeenCalled();
});
it("freezes a copy of a guard's refusal, never the objects the guard put in it", async () => {
	const shared = { stock: 3 };
	const refusal = { deny: { reasonKey: 'no_stock', detail: { record: shared } } };
	register(async () => refusal);
	const result = await dispatch();
	expect(result).toEqual(refusal);
	expect(result).not.toBe(refusal);
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(shared)).toBe(false);
	shared.stock = 4; // still the guard's to change
	expect((result as typeof refusal).deny.detail.record.stock).toBe(3);
});
it('presents a refusal through the context unless the hook already did', async () => {
	presentActionRefusal(
		ctx,
		{ deny: { reasonKey: 'actions.hook_failed', detail: { hookId: 'x' } } },
		{ orderId: 'o' }
	);
	expect(log).toHaveBeenCalledWith('warn', 'actions.hook_failed', {
		showToast: true,
		context: { orderId: 'o', hookId: 'x', reasonKey: 'actions.hook_failed' },
	});
	log.mockClear();
	presentActionRefusal(ctx, { deny: { reasonKey: 'pos_products.out_of_stock', presented: true } });
	expect(log).not.toHaveBeenCalled();
});
it("silences a hook's log once its dispatch has settled, so a timed-out guard cannot toast later", async () => {
	jest.useFakeTimers();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	register(async (hookCtx, e, next) => {
		hookCtx.log('info', 'before the budget');
		await held;
		hookCtx.log('warn', 'after the budget', { showToast: true });
		return next(e);
	});
	const result = dispatch();
	await jest.advanceTimersByTimeAsync(1500);
	expect(await result).toMatchObject({ deny: { reasonKey: 'actions.hook_timeout' } });
	release();
	await Promise.resolve();
	await Promise.resolve();
	expect(log).toHaveBeenCalledWith('info', 'before the budget', undefined);
	expect(log).not.toHaveBeenCalledWith('warn', 'after the budget', expect.anything());
	expect(bottom).not.toHaveBeenCalled();
});
it('refuses when a required guard is not registered, and runs when it is', async () => {
	const args = {
		event: 'cart.line.add' as const,
		input,
		ctx,
		bottom,
		requiredGuards: ['stock.guard'],
	};
	expect(await dispatchAction({ ...args, token: createDispatchToken() })).toEqual({
		deny: {
			reasonKey: 'actions.guard_missing',
			detail: { hookId: 'stock.guard', event: 'cart.line.add' },
		},
	});
	expect(bottom).not.toHaveBeenCalled();
	registerActionHook('cart.line.add', async (_, e, next) => next(e), {
		id: 'stock.guard',
		tier: 'extension',
	});
	expect(await dispatchAction({ ...args, token: createDispatchToken() })).toMatchObject({
		deny: { reasonKey: 'actions.guard_missing' },
	});
	registerActionHook('cart.line.add', async (_, e, next) => next(e), {
		id: 'stock.guard',
		tier: 'guard',
	});
	expect(await dispatchAction({ ...args, token: createDispatchToken() })).toBe('saved');
});
it('refuses a disabled guard without calling it or bottom', async () => {
	const hook = jest.fn(async () => {
		throw new Error('broken');
	});
	register(hook);
	await dispatch();
	await dispatch();
	await dispatch();
	expect(await dispatch()).toEqual({
		deny: {
			reasonKey: 'actions.hook_disabled',
			detail: { hookId: 'test.hook', event: 'cart.line.add' },
		},
	});
	expect(hook).toHaveBeenCalledTimes(3);
	expect(bottom).not.toHaveBeenCalled();
	expect(log).toHaveBeenCalledTimes(4);
});
it('freezes a dispatcher hook_failed refusal before an extension can edit it', async () => {
	register(async () => {
		throw new Error('broken');
	});
	let refusal: unknown;
	let mutationThrew = false;
	registerActionHook(
		'cart.line.add',
		async (_, e, next) => {
			const result = await next(e);
			refusal = result;
			try {
				(result as { deny: { reasonKey: string } }).deny.reasonKey = 'edited';
			} catch {
				mutationThrew = true;
			}
			return result;
		},
		{ id: 'tampering.extension', tier: 'extension' }
	);
	expect(await dispatch()).toMatchObject({ deny: { reasonKey: 'actions.hook_failed' } });
	expect(mutationThrew).toBe(true);
	expect(Object.isFrozen(refusal)).toBe(true);
	expect(bottom).not.toHaveBeenCalled();
});

it('passes tender register and session rewrites to bottom', async () => {
	registerActionHook(
		'checkout.tender.commit',
		async (_, e, next) =>
			next({
				...e,
				payload: { ...e.payload, registerId: 'resolved-register', sessionId: 'resolved-session' },
			}),
		{ id: 'session.gate', tier: 'guard' }
	);
	await dispatchAction({
		event: 'checkout.tender.commit',
		ctx,
		token: createDispatchToken(),
		bottom,
		input: {
			...input,
			payload: {
				methodId: 'cash',
				mode: 'manual',
				amountMinor: 100,
				tenderedMinor: 100,
				balanceMinor: 100,
				completing: true,
				bindingStatus: 'bound',
				registerId: null,
				sessionId: null,
			},
		},
	});
	expect(bottom).toHaveBeenCalledWith(
		expect.objectContaining({
			payload: expect.objectContaining({
				registerId: 'resolved-register',
				sessionId: 'resolved-session',
			}),
		})
	);
});
