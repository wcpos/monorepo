import { ERROR_CATALOGUE } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { MerchantToastCopy } from '@wcpos/utils/logger';
import type { ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

import { translateErrorAction } from '../screens/main/logs/generated/error-actions.generated';
import { translateErrorSummary } from '../screens/main/logs/generated/error-summaries.generated';

/** The translate function shape `useT()` returns, narrowed to what we need. */
type TranslateError = (key: string) => string;

/** The i18n key prefixes the generated translators resolve through. */
const SUMMARY_KEY_PREFIX = 'health.logs.error_summary.';
const ACTION_KEY_PREFIX = 'health.logs.error_action.';

function isErrorCode(code: string): code is ErrorCode {
	return Object.prototype.hasOwnProperty.call(ERROR_CATALOGUE, code);
}

/**
 * i18next returns the KEY when a string is missing. The English catalogue is
 * generated from the registry and bundled statically, so this should never
 * fire — but "health.logs.error_summary.SYNC101" in front of a cashier is worse
 * than the developer message it replaced, so we check rather than assume.
 */
function resolvedOrNull(value: string, keyPrefix: string): string | null {
	return value.startsWith(keyPrefix) ? null : value;
}

export interface MerchantToastText {
	title: string;
	description?: string;
}

/**
 * The merchant sentence for a toast, in precedence order:
 *
 *   1. An explicit `toast.title` from the call site. Someone wrote that line
 *      FOR the cashier; it always wins.
 *   2. The error code's translated summary, with the code's action hint as the
 *      description — the same two strings the log row detail already shows, so
 *      the toast and the health screen say the same thing in the same language.
 *   3. The log message, and only when there is no code at all. It is written
 *      for developers and is never translated; it is the last resort, not the
 *      default.
 *
 * Exported separately from `createMerchantToast` so the precedence is testable
 * without a Toaster.
 */
export function resolveMerchantToastText(
	t: TranslateError,
	copy: MerchantToastCopy
): MerchantToastText {
	if (copy.explicitTitle !== undefined) {
		return { title: copy.explicitTitle };
	}

	const code = copy.errorCode;
	if (typeof code === 'string' && isErrorCode(code)) {
		const summary = resolvedOrNull(translateErrorSummary(t, code), SUMMARY_KEY_PREFIX);
		if (summary !== null) {
			const action = resolvedOrNull(translateErrorAction(t, code), ACTION_KEY_PREFIX);
			return action !== null ? { title: summary, description: action } : { title: summary };
		}
	}

	return { title: copy.logMessage };
}

/**
 * Wraps a toast implementation so every logger toast reaching it carries a
 * merchant sentence rather than the developer's log message.
 *
 * This is the core side of the logger's `setToast` seam. It lives here, not in
 * `packages/utils`, because the translated per-code copy is generated into
 * `packages/core` — and `packages/utils` is a DEPENDENCY of core, so it can
 * never import it. Everything the logger knows about the title arrives on the
 * config as `merchantCopy`; this function applies the precedence and strips the
 * field so it never reaches the Toaster as an unknown sonner option.
 *
 * `t` is captured at call time. Re-create the adapter when `t` changes identity
 * (i.e. on a language change) so the next toast speaks the new language.
 */
export function createMerchantToast<TShow extends (config: any) => any>(
	t: TranslateError,
	show: TShow
): (config: any) => ReturnType<TShow> {
	return (config: any) => {
		if (!config || typeof config !== 'object' || !config.merchantCopy) {
			return show(config) as ReturnType<TShow>;
		}

		const { merchantCopy, ...rest } = config as { merchantCopy: MerchantToastCopy } & Record<
			string,
			unknown
		>;
		const { title, description } = resolveMerchantToastText(t, merchantCopy);

		return show({
			...rest,
			title,
			// An explicit `toast.text2` is the call site's own second sentence and
			// outranks the code's action hint.
			...(rest.description === undefined && description !== undefined ? { description } : {}),
		}) as ReturnType<TShow>;
	};
}
