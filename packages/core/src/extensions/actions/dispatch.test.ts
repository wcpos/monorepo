import { createActionContext } from './context';
import { dispatchAction } from './dispatch';
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
it('disables after the third strike and logs once, skipping the hook on later dispatches', async () => {
	const hook = jest.fn(async () => {
		throw new Error('broken');
	});
	register(hook, 'extension');
	await dispatch();
	await dispatch();
	await dispatch();
	expect(await dispatch()).toBe('saved');
	expect(hook).toHaveBeenCalledTimes(3);
	expect(log).toHaveBeenCalledTimes(1);
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
	expect(log).toHaveBeenCalledTimes(1);
});
