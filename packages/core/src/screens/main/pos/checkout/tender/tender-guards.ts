import {
	type ActionHook,
	registerActionHook,
	TENDER_COMMIT_EVENT,
	TENDER_GUARD_IDS,
} from '../../../../../extensions/actions';
import { RegisterSessionRequiredError } from '../../../../../services/register-session/session-store';

/** The reasons the two gates refuse with; callers present them as the cashier's next step. */
export const CHOOSE_REGISTER_REASON = 'pos_checkout.choose_register_first';
export const SESSION_REQUIRED_REASON = 'pos_checkout.open_register_first';

/**
 * Only a completing sale needs a chosen register: a store with several and none picked cannot start
 * one. Judged on the amounts the writer will write, so a rounding rewrite that settles is caught.
 */
export const registerGate: ActionHook<typeof TENDER_COMMIT_EVENT> = async (_ctx, e, next) => {
	if (e.payload.amountMinor === e.payload.balanceMinor && e.payload.bindingStatus === 'choose')
		return { deny: { reasonKey: CHOOSE_REGISTER_REASON, detail: { event: e.event } } };
	return next(e);
};

export const sessionGate: ActionHook<typeof TENDER_COMMIT_EVENT> = async (ctx, e, next) => {
	try {
		const { registerId, sessionId } = await ctx.register.resolveSession();
		return next({ ...e, payload: { ...e.payload, registerId, sessionId } });
	} catch (error) {
		if (error instanceof RegisterSessionRequiredError)
			return { deny: { reasonKey: SESSION_REQUIRED_REASON, detail: { event: e.event } } };
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
