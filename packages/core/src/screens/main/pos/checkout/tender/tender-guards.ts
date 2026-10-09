import { type ActionHook, registerActionHook } from '../../../../../extensions/actions';
import { RegisterSessionRequiredError } from '../../../../../services/register-session/session-store';
import { gateSale } from '../sale-completion';

export const registerGate: ActionHook<'checkout.tender.commit'> = async (_ctx, e, next) => {
	if (!gateSale({ completing: e.payload.completing, bindingStatus: e.payload.bindingStatus }).ok)
		return {
			deny: { reasonKey: 'pos_checkout.choose_register_first', detail: { event: e.event } },
		};
	return next(e);
};

export const sessionGate: ActionHook<'checkout.tender.commit'> = async (ctx, e, next) => {
	try {
		const { registerId, sessionId } = await ctx.register.resolveSession();
		return next({ ...e, payload: { ...e.payload, registerId, sessionId } });
	} catch (error) {
		if (error instanceof RegisterSessionRequiredError)
			return {
				deny: { reasonKey: 'pos_checkout.open_register_first', detail: { event: e.event } },
			};
		throw error;
	}
};

registerActionHook('checkout.tender.commit', registerGate, {
	id: 'register.gate',
	tier: 'guard',
	order: 0,
});
registerActionHook('checkout.tender.commit', sessionGate, {
	id: 'session.gate',
	tier: 'guard',
	order: 1,
});
