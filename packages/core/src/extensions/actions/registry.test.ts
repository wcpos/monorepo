import {
	getActionHooks,
	getActionHookState,
	recordActionHookStrike,
	registerActionHook,
	resetActionRegistry,
} from './registry';

import type { ActionHook } from './types';

const pass: ActionHook<'cart.line.add'> = async (_, e, next) => next(e);
beforeEach(() => resetActionRegistry());
afterEach(() => jest.restoreAllMocks());

it('orders guards before extensions, then by order and id within each tier', () => {
	for (const tier of ['extension', 'guard'] as const) {
		for (const [id, order] of [
			['z', 1],
			['a', 1],
			['first', 0],
		] as const) {
			registerActionHook('cart.line.add', pass, { id: `${tier}.${id}`, tier, order });
		}
	}
	expect(getActionHooks('cart.line.add').map(({ id }) => id)).toEqual([
		'guard.first',
		'guard.a',
		'guard.z',
		'extension.first',
		'extension.a',
		'extension.z',
	]);
});
it('keeps snapshots stable until registration changes', () => {
	const empty = getActionHooks('cart.line.add');
	expect(getActionHooks('cart.line.add')).toBe(empty);
	registerActionHook('cart.line.add', pass, { id: 'stock.guard', tier: 'guard' });
	const registered = getActionHooks('cart.line.add');
	expect(registered).not.toBe(empty);
	expect(getActionHooks('cart.line.add')).toBe(registered);
});
it('warns and replaces duplicate ids outside production', () => {
	const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	registerActionHook('cart.line.add', pass, { id: 'stock.guard', tier: 'guard' });
	const replacement: typeof pass = async () => ({ deny: { reasonKey: 'refused' } });
	registerActionHook('cart.line.add', replacement, { id: 'stock.guard', tier: 'guard' });
	expect(getActionHooks('cart.line.add')).toHaveLength(1);
	expect(getActionHooks('cart.line.add')[0].hook).toBe(replacement);
	expect(warn).toHaveBeenCalledTimes(1);
});
it('throws for duplicate ids in production but permits the same id on another event', () => {
	const previous = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		registerActionHook('cart.line.add', pass, { id: 'stock.guard', tier: 'guard' });
		registerActionHook('cart.line.update', async (_, e, next) => next(e), {
			id: 'stock.guard',
			tier: 'guard',
		});
		expect(() =>
			registerActionHook('cart.line.add', pass, { id: 'stock.guard', tier: 'guard' })
		).toThrow();
	} finally {
		process.env.NODE_ENV = previous;
	}
});
it('shares strikes by id, excludes disabled hooks and resets both registrations and strikes', () => {
	registerActionHook('cart.line.add', pass, { id: 'stock.guard', tier: 'extension' });
	const before = getActionHooks('cart.line.add');
	for (let i = 0; i < 3; i++) recordActionHookStrike('stock.guard', 'threw');
	expect(getActionHookState('stock.guard')).toEqual({ strikes: 3, disabled: true });
	expect(getActionHooks('cart.line.add')).not.toBe(before);
	expect(getActionHooks('cart.line.add')).toEqual([]);
	resetActionRegistry();
	expect(getActionHookState('stock.guard')).toEqual({ strikes: 0, disabled: false });
});

it('keeps a disabled guard in the chain', () => {
	registerActionHook('cart.line.add', pass, { id: 'stock.guard', tier: 'guard' });
	for (let i = 0; i < 3; i++) recordActionHookStrike('stock.guard', 'threw');
	expect(getActionHooks('cart.line.add').map(({ id }) => id)).toEqual(['stock.guard']);
});
