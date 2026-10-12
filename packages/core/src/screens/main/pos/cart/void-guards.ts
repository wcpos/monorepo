import {
	type ActionHook,
	ORDER_VOID_EVENT,
	ORDER_VOID_GUARD_IDS,
	registerActionHook,
} from '../../../../extensions/actions';

/** The reason the gate refuses with; the toast names the tender pane's Cancel as the way out. */
export const VOID_PAYMENTS_FIRST_REASON = 'pos_cart.void_payments_first';

/**
 * Money on the order stops a void: a live or captured payment leg has to be reversed first,
 * which is the tender pane's Cancel (it voids the legs and keeps the order). Deleting the order
 * around captured money would lose the record of it. No session gate: a void moves no money and
 * must work with no open session.
 */
export const paymentsGate: ActionHook<typeof ORDER_VOID_EVENT> = async (_ctx, e, next) => {
	const { live, captured } = e.payload.paymentLegs;
	if (live + captured > 0)
		return {
			deny: {
				reasonKey: VOID_PAYMENTS_FIRST_REASON,
				detail: { event: e.event, live, captured },
			},
		};
	return next(e);
};

const [PAYMENTS_GATE_ID] = ORDER_VOID_GUARD_IDS;
registerActionHook(ORDER_VOID_EVENT, paymentsGate, {
	id: PAYMENTS_GATE_ID,
	tier: 'guard',
	order: 0,
});
