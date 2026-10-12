import {
	type ActionEventInput,
	createActionContext,
	registerActionHook,
	resetActionRegistry,
} from '../../../../extensions/actions';
import {
	applyCouponLine,
	CartChangedError,
	cartSnapshotOf,
	isActionRefusal,
	removeCouponLine,
} from './coupon-line-actions';
import { enqueueOrderMutation, resetOrderMutationQueues } from './order-mutation-queue';

const log = jest.fn();
const ctx = createActionContext({
	log,
	t: (key) => key,
	readCatalog: async () => null,
	preventOverselling: false,
	resolveSession: async () => ({ registerId: null, sessionId: null }),
});
const actor = { userId: 7, registerId: 'till', sessionId: null };
const recalculate = jest.fn();
const localPatch = jest.fn();
const writer = { ctx, actor, recalculate, localPatch } as never;

const lineItems = [{ product_id: 1, quantity: 1, total: '100' }];
let couponLines: Record<string, unknown>[] = [];
const cart = () => ({ line_items: lineItems, coupon_lines: couponLines });
const order = { uuid: 'order', getLatest: () => ({ payload: cart() }) } as never;
const saved = { code: 'save10', discount: '0', discount_tax: '0', meta_data: [] } as never;

beforeEach(() => {
	resetOrderMutationQueues();
	jest.clearAllMocks();
	resetActionRegistry();
	couponLines = [];
	recalculate.mockImplementation(async (lines, coupons) => ({
		lineItems: lines.map((line: Record<string, unknown>) => ({ ...line, total: '90' })),
		couponLines: coupons,
	}));
	localPatch.mockResolvedValue({ uuid: 'order' });
});

it('apply: dispatches the entering line with the cart, then recalculates and patches both lists', async () => {
	couponLines = [{ code: 'existing' }];
	const seen: ActionEventInput<'cart.coupon.apply'>[] = [];
	registerActionHook(
		'cart.coupon.apply',
		async (_ctx, e, next) => {
			seen.push(e);
			expect(recalculate).not.toHaveBeenCalled();
			return next(e);
		},
		{ id: 'test.observer', tier: 'extension' }
	);
	await expect(applyCouponLine(writer, order, saved, cartSnapshotOf(cart()))).resolves.toEqual({
		patched: { uuid: 'order' },
		couponLines: [{ code: 'existing' }, saved],
	});
	expect(seen).toEqual([
		expect.objectContaining({
			event: 'cart.coupon.apply',
			orderId: 'order',
			actor,
			payload: { couponLine: saved, lineItems, couponLines: [{ code: 'existing' }] },
		}),
	]);
	expect(recalculate).toHaveBeenCalledWith(lineItems, [{ code: 'existing' }, saved]);
	expect(localPatch).toHaveBeenCalledWith({
		document: order,
		data: {
			coupon_lines: [{ code: 'existing' }, saved],
			line_items: [{ product_id: 1, quantity: 1, total: '90' }],
		},
	});
});

it('apply: a guard refusal is returned and nothing is recalculated or written', async () => {
	registerActionHook(
		'cart.coupon.apply',
		async () => ({ deny: { reasonKey: 'loyalty.no_stacking' } }),
		{ id: 'test.guard', tier: 'guard' }
	);
	const outcome = await applyCouponLine(writer, order, saved, cartSnapshotOf(cart()));
	expect(isActionRefusal(outcome)).toBe(true);
	expect(recalculate).not.toHaveBeenCalled();
	expect(localPatch).not.toHaveBeenCalled();
});

it('apply: a cart that moved under the recalculation is refused with CartChangedError, unwritten', async () => {
	recalculate.mockImplementationOnce(async (lines, coupons) => {
		couponLines = [{ code: 'slipped-in' }];
		return { lineItems: lines, couponLines: coupons };
	});
	await expect(
		applyCouponLine(writer, order, saved, cartSnapshotOf(cart()))
	).rejects.toBeInstanceOf(CartChangedError);
	expect(localPatch).not.toHaveBeenCalled();
});

it.each([
	['synced', { id: 9, code: 'save10' }, [{ id: 9, code: null }]],
	['local', { code: 'save10' }, []],
])('remove: a %s line leaves and the rest are recalculated', async (_kind, line, remaining) => {
	couponLines = [line, { code: 'keep' }];
	const seen: ActionEventInput<'cart.coupon.remove'>[] = [];
	registerActionHook(
		'cart.coupon.remove',
		async (_ctx, e, next) => {
			seen.push(e);
			return next(e);
		},
		{ id: 'test.observer', tier: 'extension' }
	);
	await expect(removeCouponLine(writer, order, ' SAVE10 ')).resolves.toMatchObject({
		patched: { uuid: 'order' },
	});
	expect(seen[0].payload).toEqual({
		code: ' SAVE10 ',
		couponLine: line,
		lineItems,
		couponLines: [line, { code: 'keep' }],
	});
	expect(recalculate).toHaveBeenCalledWith(lineItems, [...remaining, { code: 'keep' }]);
	expect(localPatch).toHaveBeenCalledTimes(1);
});

it('remove: a code that is not on the order dispatches nothing and resolves false', async () => {
	const seen = jest.fn(async (_ctx: unknown, e: unknown, next: (e: unknown) => unknown) => next(e));
	registerActionHook('cart.coupon.remove', seen as never, {
		id: 'test.observer',
		tier: 'extension',
	});
	await expect(removeCouponLine(writer, order, 'missing')).resolves.toBe(false);
	expect(seen).not.toHaveBeenCalled();
	expect(localPatch).not.toHaveBeenCalled();
});

it('remove: a guard refusal keeps the coupon on the order', async () => {
	couponLines = [{ code: 'save10' }];
	registerActionHook('cart.coupon.remove', async () => ({ deny: { reasonKey: 'test.locked' } }), {
		id: 'test.guard',
		tier: 'guard',
	});
	expect(isActionRefusal(await removeCouponLine(writer, order, 'save10'))).toBe(true);
	expect(localPatch).not.toHaveBeenCalled();
});

it('apply: a write queued ahead that moves the cart refuses the apply at slot entry, before any hook', async () => {
	const validated = cartSnapshotOf(cart());
	const hook = jest.fn(async (_ctx: unknown, e: unknown, next: (e: unknown) => unknown) => next(e));
	registerActionHook('cart.coupon.apply', hook as never, {
		id: 'test.observer',
		tier: 'extension',
	});
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	void enqueueOrderMutation('order', async () => {
		await gate;
		couponLines = [{ code: 'pos-discount' }];
	});
	const pending = applyCouponLine(writer, order, saved, validated);
	release();
	await expect(pending).rejects.toBeInstanceOf(CartChangedError);
	expect(hook).not.toHaveBeenCalled();
	expect(recalculate).not.toHaveBeenCalled();
	expect(localPatch).not.toHaveBeenCalled();
});

it('remove: every line carrying the code leaves, not only the first', async () => {
	couponLines = [{ id: 1, code: 'save10' }, { code: 'keep' }, { code: 'SAVE10' }];
	await removeCouponLine(writer, order, 'save10');
	expect(recalculate).toHaveBeenCalledWith(lineItems, [{ id: 1, code: null }, { code: 'keep' }]);
});

it('apply: lands on the saved order a first add left on the slot, not the record it was called with', async () => {
	const savedLines: Record<string, unknown>[] = [];
	const savedOrder = {
		uuid: 'order',
		getLatest: () => ({ payload: { line_items: lineItems, coupon_lines: savedLines } }),
	} as never;
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	void enqueueOrderMutation('order', async (queue) => {
		await gate;
		queue.order = savedOrder;
	});
	// Validated against the temporary record's cart, which the saved order still matches.
	const pending = applyCouponLine(writer, order, saved, cartSnapshotOf(cart()));
	release();
	await expect(pending).resolves.toMatchObject({ patched: { uuid: 'order' } });
	expect(localPatch).toHaveBeenCalledWith(expect.objectContaining({ document: savedOrder }));
});

it('remove: lands on the saved order the queue remembers for this order', async () => {
	couponLines = [{ code: 'save10' }];
	const savedOrder = {
		uuid: 'order',
		getLatest: () => ({ payload: { line_items: lineItems, coupon_lines: [{ code: 'save10' }] } }),
	} as never;
	await enqueueOrderMutation('order', async (queue) => {
		queue.order = savedOrder;
	});
	await removeCouponLine(writer, order, 'save10');
	expect(localPatch).toHaveBeenCalledWith(expect.objectContaining({ document: savedOrder }));
});
