import {
	type ActionActor,
	type ActionContext,
	type ActionRefusal,
	dispatchAction,
	isActionRefusal,
} from '../../../../extensions/actions';
import { enqueueOrderMutation, type OrderMutationContext } from './order-mutation-queue';

import type { RecalculateResult } from './coupon-recalculate';
import type { CurrentOrderRecord } from '../contexts/current-order';

type OrderDocument = import('@wcpos/query').OrderPayload;
type CouponLine = NonNullable<OrderDocument['coupon_lines']>[number];
type Plain = Record<string, unknown>;

/** The cart moved under the recalculation; the caller tells the cashier to try again. */
export class CartChangedError extends Error {
	constructor() {
		super('cart_changed');
		this.name = 'CartChangedError';
	}
}

export interface CouponLineWriter {
	ctx: ActionContext;
	actor: ActionActor;
	recalculate: (order: OrderDocument, couponLines: CouponLine[]) => Promise<RecalculateResult>;
	localPatch: (input: {
		document: CurrentOrderRecord;
		data: Plain;
		queue: OrderMutationContext;
	}) => Promise<unknown>;
}

/** The cart a coupon decision is made against: a hook takes it from the very order it validated. */
export function cartSnapshotOf(payload: { line_items?: unknown; coupon_lines?: unknown }): string {
	return JSON.stringify({ line_items: payload.line_items, coupon_lines: payload.coupon_lines });
}
function cartSnapshot(order: CurrentOrderRecord): string {
	return cartSnapshotOf(order.getLatest().payload);
}

/**
 * The one writer for the order's coupon lines: every coupon is recalculated from scratch against
 * the product lines, then both lists are patched together. Runs as the bottom handler of the
 * two coupon events, inside the order's mutation queue.
 */
async function writeCouponLines(
	writer: CouponLineWriter,
	order: CurrentOrderRecord,
	before: string,
	couponLines: CouponLine[],
	queue: OrderMutationContext
) {
	const latest = order.getLatest();
	const result = await writer.recalculate(latest.payload, couponLines);
	// A recalculation that could not price the cart writes nothing (kept from the hook it replaced).
	if (!result) return false;
	// The recalculation reads the engine; a cart that moved meanwhile is not the cart it priced.
	if (cartSnapshot(order) !== before) throw new CartChangedError();
	const patched = await writer.localPatch({
		document: order,
		queue,
		data: { coupon_lines: result.couponLines, line_items: result.lineItems },
	});
	if (isActionRefusal(patched)) return patched;
	return patched ? { patched, couponLines: result.couponLines } : false;
}

/**
 * What a coupon write hands back: the patch result and the coupon lines as written. A dispatch
 * that is not a refusal carries the bottom handler's return (a hook answering without `next` is
 * refused as `actions.hook_failed`), so the casts below are sound.
 */
export type CouponWriteResult = { patched: unknown; couponLines: CouponLine[] };

/**
 * A coupon line (a catalog coupon, or a quick discount carrying its intent) enters the order.
 * `validated` is the cart the caller's rules were checked against: a queued write that landed
 * before this slot invalidates those checks, so the slot refuses rather than apply to a cart the
 * rules never saw (two applies of one code, a quick discount beside an individual-use coupon).
 */
export function applyCouponLine(
	writer: CouponLineWriter,
	order: CurrentOrderRecord,
	couponLine: CouponLine,
	validated: string
): Promise<ActionRefusal | CouponWriteResult | false> {
	return enqueueOrderMutation(order.uuid, (queue) => {
		// A first add queued ahead left the saved order on the slot; the coupon lands on it.
		const target = queue.order ?? order;
		const before = cartSnapshot(target);
		if (before !== validated) throw new CartChangedError();
		const latest = target.getLatest().payload;
		const couponLines = latest.coupon_lines ?? [];
		return dispatchAction({
			event: 'cart.coupon.apply',
			token: queue.dispatchToken,
			ctx: writer.ctx,
			input: {
				orderId: target.uuid,
				actor: writer.actor,
				source: 'user',
				payload: {
					couponLine: couponLine as Plain,
					lineItems: (latest.line_items ?? []) as Plain[],
					couponLines: couponLines as Plain[],
				},
			},
			bottom: () => writeCouponLines(writer, target, before, [...couponLines, couponLine], queue),
		}) as Promise<ActionRefusal | CouponWriteResult | false>;
	});
}

/** A coupon line leaves the order: a synced line is retired by nulling its code, a local one dropped. */
export function removeCouponLine(
	writer: CouponLineWriter,
	order: CurrentOrderRecord,
	code: string
): Promise<ActionRefusal | CouponWriteResult | false> {
	return enqueueOrderMutation(order.uuid, (queue) => {
		const target = queue.order ?? order;
		const before = cartSnapshot(target);
		const latest = target.getLatest().payload;
		const couponLines = latest.coupon_lines ?? [];
		const normalized = code.toLowerCase().trim();
		const matches = (line: CouponLine) => (line.code ?? '').toLowerCase() === normalized;
		const removed = couponLines.find(matches);
		if (!removed) return Promise.resolve(false);
		// Every line carrying the code leaves (a duplicate is reachable through overlapping
		// applies); the first is what the event names.
		const remaining = couponLines
			.map((line) => (matches(line) ? (line.id ? { ...line, code: null } : null) : line))
			.filter((line): line is CouponLine => line !== null);
		return dispatchAction({
			event: 'cart.coupon.remove',
			token: queue.dispatchToken,
			ctx: writer.ctx,
			input: {
				orderId: target.uuid,
				actor: writer.actor,
				source: 'user',
				payload: {
					code,
					couponLine: removed as Plain,
					lineItems: (latest.line_items ?? []) as Plain[],
					couponLines: couponLines as Plain[],
				},
			},
			bottom: () => writeCouponLines(writer, target, before, remaining, queue),
		}) as Promise<ActionRefusal | CouponWriteResult | false>;
	});
}

export { isActionRefusal };
