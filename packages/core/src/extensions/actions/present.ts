import type { ActionContext, ActionRefusal } from './types';

/**
 * The one translation key this app cannot write literally: a key an extension registers (a
 * command's `label`, a refusal's `reasonKey`) is its registrant's data, and the registrant ships
 * the catalog entry. Every key core registers is also a literal call where core shows it.
 */
export const registrantText = (
	t: ActionContext['t'],
	key: string,
	params?: Record<string, string | number>
) => t(key, params);

/** A refusal's line: the dispatcher's own reasons are literal calls, a hook's own key is its registrant's. */
export function refusalText(deny: ActionRefusal['deny'], t: ActionContext['t']): string {
	if (deny.reasonKey === 'actions.guard_missing') return t('actions.guard_missing', deny.params);
	if (deny.reasonKey === 'actions.hook_disabled') return t('actions.hook_disabled', deny.params);
	if (deny.reasonKey === 'actions.hook_timeout') return t('actions.hook_timeout', deny.params);
	if (deny.reasonKey === 'actions.hook_failed') return t('actions.hook_failed', deny.params);
	if (deny.reasonKey === 'pos_cart.void_payments_first')
		return t('pos_cart.void_payments_first', deny.params);
	return registrantText(t, deny.reasonKey, deny.params);
}

/**
 * Show a refusal the caller received: a warn row with a toast of the translated reason, unless
 * the hook that refused has already presented it (`deny.presented`). The dispatcher's own
 * refusals (`actions.hook_timeout`, `actions.hook_failed`, `actions.hook_disabled`) are never
 * presented by a hook, so every caller sees them through this.
 */
export function presentActionRefusal(
	ctx: ActionContext,
	refusal: ActionRefusal,
	context?: Record<string, unknown>
): void {
	if (refusal.deny.presented) return;
	ctx.log('warn', refusalText(refusal.deny, ctx.t), {
		showToast: true,
		context: { ...context, ...refusal.deny.detail, reasonKey: refusal.deny.reasonKey },
	});
}
