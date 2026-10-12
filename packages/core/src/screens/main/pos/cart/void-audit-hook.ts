import {
	type ActionHook,
	isActionRefusal,
	ORDER_VOID_EVENT,
	registerActionHook,
} from '../../../../extensions/actions';

/** The first consumer of a void: the Logs row, with who did it. A refused void is no void. */
export const auditOrderVoided: ActionHook<typeof ORDER_VOID_EVENT> = async (ctx, e, next) => {
	const result = await next(e);
	if (isActionRefusal(result)) return result;
	ctx.log('info', `Order ${e.orderId} voided`, {
		category: ['wcpos', 'pos', 'cart', 'void'],
		actor: e.payload.actor ?? undefined,
		context: {
			type: 'order.voided',
			orderId: e.payload.orderId,
			orderUUID: e.orderId,
			orderNumber: e.payload.orderNumber,
			status: e.payload.status,
			outcome: result.kind,
			registerId: e.payload.registerId,
			sessionId: e.payload.sessionId,
		},
	});
	return result;
};
registerActionHook(ORDER_VOID_EVENT, auditOrderVoided, {
	id: 'audit.order-voided',
	tier: 'extension',
	order: 0,
});
