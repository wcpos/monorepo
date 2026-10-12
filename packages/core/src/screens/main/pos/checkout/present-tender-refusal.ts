import type { CategoryLogger, LoggerOptions } from '@wcpos/utils/logger';

import { presentSessionRequired } from './session-required';
import { CHOOSE_REGISTER_REASON, SESSION_REQUIRED_REASON } from './tender/tender-guards';
import {
	type ActionContext,
	type ActionRefusal,
	presentActionRefusal,
} from '../../../../extensions/actions';

import type { useT } from '../../../../contexts/translations';

/**
 * Show a refused tender commit the way the cashier expects: the two gates' refusals are the
 * next step to take (open the register, choose one) on the caller's own logger; any other
 * refusal is presented as the hook phrased it. Returns the reason so a caller can react.
 */
export function presentTenderRefusal(
	actionCtx: ActionContext,
	refusal: ActionRefusal,
	logger: CategoryLogger,
	t: ReturnType<typeof useT>,
	context?: LoggerOptions['context']
): string {
	const { reasonKey, presented } = refusal.deny;
	if (presented) return reasonKey;
	if (reasonKey === SESSION_REQUIRED_REASON) presentSessionRequired(logger, t, context);
	else if (reasonKey === CHOOSE_REGISTER_REASON)
		logger.info(t(CHOOSE_REGISTER_REASON), { showToast: true, context });
	else presentActionRefusal(actionCtx, refusal, context);
	return reasonKey;
}
