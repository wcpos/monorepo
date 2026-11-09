import { enqueueCartAction } from '../hooks/enqueue-cart-action';
import {
	type ActionActor,
	type ActionContext,
	type ActionEvent,
	type ActionEventInput,
	type ActionRefusal,
	dispatchAction,
} from '../../../../extensions/actions';

import type { useCartWrite } from './use-cart-write';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';
import type { CurrentOrderRecord } from '../contexts/current-order';

/** The cashier's cart events; the birth path (`useAddItemToOrder`) keeps its own envelope. */
export type CartCommandEvent =
	Extract<ActionEvent, `cart.${'line' | 'coupon'}.${string}`> | 'cart.customer.set';

type SettledWrite = ReturnType<typeof useCartWrite>['settledWrite'];
/** The settled write in the slot's queue, to the revision the bottom read (default: target). */
export type SlotWrite = (
	data: Parameters<SettledWrite>[0]['data'],
	snapshot?: CurrentOrderRecord
) => ReturnType<SettledWrite>;

export interface CartCommandSlot<E extends CartCommandEvent> {
	/** The order the slot acts on: a first add queued ahead leaves its saved order here. */
	target: CurrentOrderRecord;
	ctx: ActionContext;
	/** The one dispatch the slot makes: standard input, then `bottom` computes and writes. */
	dispatch: (
		payload: ActionEventInput<E>['payload'],
		bottom: (e: ActionEventInput<E>, write: SlotWrite) => Promise<unknown>
	) => Promise<unknown>;
}
type Run<E extends CartCommandEvent, R> = (slot: CartCommandSlot<E>) => Promise<R | ActionRefusal>;

/**
 * Run in the order's queue slot; a refusal is presented (`present(record)` its log context) as
 * `false`, or returned to a `'caller'`. Without `record`, the order is read at the press
 * (current-order ledger 1).
 */
export interface CartCommand<E extends CartCommandEvent> {
	<R>(
		run: Run<E, R>,
		present: (record: CurrentOrderRecord) => Record<string, unknown>,
		record?: CurrentOrderRecord
	): Promise<R | false>;
	<R>(run: Run<E, R>, present: 'caller', record?: CurrentOrderRecord): Promise<R | ActionRefusal>;
}

export interface CartCommandDeps {
	ctx: ActionContext;
	actor: ActionActor;
	settledWrite: SettledWrite;
	currentRecord: () => CurrentOrderRecord;
}

export function cartCommand<E extends CartCommandEvent>(
	event: E,
	deps: CartCommandDeps
): CartCommand<E> {
	return (async <R>(
		run: Run<E, R>,
		present: 'caller' | ((record: CurrentOrderRecord) => Record<string, unknown>),
		record = deps.currentRecord()
	) => {
		if (!record.uuid) throw new Error('Order is missing its uuid');
		const slot = (target: CurrentOrderRecord, queue: OrderMutationContext) =>
			run({
				target,
				ctx: deps.ctx,
				dispatch: (payload, bottom) =>
					dispatchAction({
						event,
						token: queue.dispatchToken,
						ctx: deps.ctx,
						input: { orderId: target.uuid, actor: deps.actor, source: 'user', payload },
						bottom: (e) =>
							bottom(e, (data, snapshot = target) =>
								deps.settledWrite({ document: snapshot, queue, data })
							),
					}),
			});
		return present === 'caller'
			? enqueueCartAction(record, slot, present)
			: enqueueCartAction(record, slot, { ctx: deps.ctx, context: present(record) });
	}) as CartCommand<E>;
}
