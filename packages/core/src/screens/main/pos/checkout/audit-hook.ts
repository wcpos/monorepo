import {
	type ActionHook,
	CHECKOUT_COMPLETE_EVENT,
	registerActionHook,
} from '../../../../extensions/actions';

export const auditSaleCompleted: ActionHook<typeof CHECKOUT_COMPLETE_EVENT> = async (
	ctx,
	e,
	next
) => {
	const result = await next(e);
	if (result.outcome !== 'completed' || !result.summary) return result;
	ctx.log('info', `Sale ${result.summary.orderUUID} completed`, {
		category: ['wcpos', 'pos', 'checkout'],
		actor: e.payload.actor ?? undefined,
		context: {
			type: 'checkout.completed',
			...(e.source === 'replay' ? { replayed: true } : {}),
			orderId: result.summary.orderId,
			orderUUID: result.summary.orderUUID,
			orderNumber: result.summary.orderNumber,
			total: result.summary.total,
			paymentLegs: result.summary.paymentLegs,
			hookIds: [] as string[], // Reserved: no hook can rewrite or refuse this event in v1.
		},
	});
	return result;
};
registerActionHook(CHECKOUT_COMPLETE_EVENT, auditSaleCompleted, {
	id: 'audit.sale-completed',
	tier: 'extension',
	order: 0,
});
