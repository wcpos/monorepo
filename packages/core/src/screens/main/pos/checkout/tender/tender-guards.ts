import {
	type ActionHook,
	registerActionHook,
	TENDER_COMMIT_EVENT,
	TENDER_GUARD_IDS,
} from '../../../../../extensions/actions';
import { RegisterSessionRequiredError } from '../../../../../services/register-session/session-store';
import { gateSale } from '../sale-completion';

export const registerGate: ActionHook<typeof TENDER_COMMIT_EVENT> = async (_ctx, e, next) => {
	if (!gateSale({ completing: e.payload.completing, bindingStatus: e.payload.bindingStatus }).ok)
		return {
			deny: { reasonKey: 'pos_checkout.choose_register_first', detail: { event: e.event } },
		};
	return next(e);
};

export const sessionGate: ActionHook<typeof TENDER_COMMIT_EVENT> = async (ctx, e, next) => {
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

const [REGISTER_GATE_ID, SESSION_GATE_ID] = TENDER_GUARD_IDS;
registerActionHook(TENDER_COMMIT_EVENT, registerGate, {
	id: REGISTER_GATE_ID,
	tier: 'guard',
	order: 0,
});
registerActionHook(TENDER_COMMIT_EVENT, sessionGate, {
	id: SESSION_GATE_ID,
	tier: 'guard',
	order: 1,
});
