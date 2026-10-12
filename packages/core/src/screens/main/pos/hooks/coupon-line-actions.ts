import {
	type ActionActor,
	type ActionContext,
	type ActionRefusal,
	dispatchAction,
	isActionRefusal,
} from '../../../../extensions/actions';
import { enqueueOrderMutation } from './order-mutation-queue';

import type { RecalculateResult } from './coupon-recalculate';
import type { CurrentOrderRecord } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];
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
	recalculate: (lineItems: LineItem[], couponLines: CouponLine[]) => Promise<RecalculateResult>;
	localPatch: (input: { document: CurrentOrderRecord; data: Plain }) => Promise<unknown>;
}

function cartSnapshot(order: CurrentOrderRecord) {
	const { line_items, coupon_lines } = order.getLatest().payload;
	return JSON.stringify({ line_items, coupon_lines });
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
	couponLines: CouponLine[]
) {
	const latest = order.getLatest();
	const result = await writer.recalculate(latest.payload.line_items ?? [], couponLines);
	// A recalculation that could not price the cart writes nothing (kept from the hook it replaced).
	if (!result) return false;
	// The recalculation reads the engine; a cart that moved meanwhile is not the cart it priced.
	if (cartSnapshot(order) !== before) throw new CartChangedError();
	return writer.localPatch({
		document: order,
		data: { coupon_lines: result.couponLines, line_items: result.lineItems },
	});
}

/** A coupon line (a catalog coupon, or a quick discount carrying its intent) enters the order. */
export function applyCouponLine(
	writer: CouponLineWriter,
	order: CurrentOrderRecord,
	couponLine: CouponLine
): Promise<ActionRefusal | unknown> {
	return enqueueOrderMutation(order.uuid, (queue) => {
		const before = cartSnapshot(order);
		const latest = order.getLatest().payload;
		const couponLines = latest.coupon_lines ?? [];
		return dispatchAction({
			event: 'cart.coupon.apply',
			token: queue.dispatchToken,
			ctx: writer.ctx,
			input: {
				orderId: order.uuid,
				actor: writer.actor,
				source: 'user',
				payload: {
					couponLine: couponLine as Plain,
					lineItems: (latest.line_items ?? []) as Plain[],
					couponLines: couponLines as Plain[],
				},
			},
			bottom: () => writeCouponLines(writer, order, before, [...couponLines, couponLine]),
		});
	});
}

/** A coupon line leaves the order: a synced line is retired by nulling its code, a local one dropped. */
export function removeCouponLine(
	writer: CouponLineWriter,
	order: CurrentOrderRecord,
	code: string
): Promise<ActionRefusal | unknown> {
	return enqueueOrderMutation(order.uuid, (queue) => {
		const before = cartSnapshot(order);
		const latest = order.getLatest().payload;
		const couponLines = latest.coupon_lines ?? [];
		const normalized = code.toLowerCase().trim();
		const removed = couponLines.find((line) => (line.code ?? '').toLowerCase() === normalized);
		if (!removed) return Promise.resolve(false);
		const remaining = couponLines
			.map((line) => (line === removed ? (line.id ? { ...line, code: null } : null) : line))
			.filter((line): line is CouponLine => line !== null);
		return dispatchAction({
			event: 'cart.coupon.remove',
			token: queue.dispatchToken,
			ctx: writer.ctx,
			input: {
				orderId: order.uuid,
				actor: writer.actor,
				source: 'user',
				payload: {
					code,
					couponLine: removed as Plain,
					lineItems: (latest.line_items ?? []) as Plain[],
					couponLines: couponLines as Plain[],
				},
			},
			bottom: () => writeCouponLines(writer, order, before, remaining),
		});
	});
}

export { isActionRefusal };
