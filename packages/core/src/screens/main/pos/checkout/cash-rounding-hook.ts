import { roundedDue, settlesAtRoundedDue } from '@wcpos/order-math';

import {
	type ActionHook,
	registerActionHook,
	TENDER_COMMIT_EVENT,
} from '../../../../extensions/actions';

/**
 * Cash rounding (#66, #84), the first rewriting consumer of the tender commit. A cash tender that
 * settles the order is due the balance rounded to the method's increment; the bottom handler
 * records the difference as a fee line before the leg. Card, partial and short tenders pass
 * through: the cashier hands what they hand. A hook writes nothing.
 */
export const cashRounding: ActionHook<typeof TENDER_COMMIT_EVENT> = async (ctx, e, next) => {
	const { mode, methodId, amountMinor, tenderedMinor, balanceMinor } = e.payload;
	const method = mode === 'manual' && methodId ? ctx.read.paymentMethod(methodId) : null;
	const { dueMinor, roundingMinor } = roundedDue(
		balanceMinor,
		method?.defaults.rounding ?? null,
		ctx.store.priceDecimals
	);
	if (
		roundingMinor === 0 ||
		!settlesAtRoundedDue({ amountMinor, tenderedMinor, balanceMinor, dueMinor })
	)
		return next(e);
	return next({
		...e,
		payload: { ...e.payload, amountMinor: dueMinor, balanceMinor: dueMinor, roundingMinor },
	});
};

registerActionHook(TENDER_COMMIT_EVENT, cashRounding, {
	id: 'cash.rounding',
	tier: 'extension',
	order: 0,
});
