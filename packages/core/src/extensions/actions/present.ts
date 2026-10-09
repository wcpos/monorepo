import type { ActionContext, ActionRefusal } from './types';

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
	ctx.log('warn', ctx.t(refusal.deny.reasonKey, refusal.deny.params), {
		showToast: true,
		context: { ...context, ...refusal.deny.detail, reasonKey: refusal.deny.reasonKey },
	});
}
