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
 * The parts of a toast config this adapter reads or rewrites.
 *
 * Deliberately a CONSTRAINT rather than a closed shape: every other field on a
 * toast config is a sonner option this adapter knows nothing about and must
 * hand through untouched, so it is the caller's own config type that flows
 * across the seam. This pins only the three fields the adapter actually
 * touches.
 *
 * The `object &` is load-bearing, not decoration: with three optional fields
 * and nothing else, this is a WEAK type, and TypeScript rejects any config
 * that happens to share none of them — the Toaster's legacy `text1` variant,
 * for one. Intersecting with `object` keeps the constraint honest without
 * excluding configs the adapter simply passes through.
 */
export type MerchantToastConfig = object & {
	/**
	 * The ingredients the logger hands across the seam, stripped before the
	 * Toaster sees them. Optional: a `Toast.show` call site with no logger
	 * involved carries no merchant copy and is passed straight through.
	 */
	merchantCopy?: MerchantToastCopy;
	/** The sentence the cashier reads. Rewritten when merchant copy is present. */
	title?: string;
	/**
	 * A second sentence. The call site's own always outranks the action hint.
	 * Deliberately open: sonner's `description` is a ReactNode, and the adapter
	 * only ever tests it for absence and writes a plain string into it, so
	 * narrowing it here would reject the real Toaster's config type.
	 */
	description?: unknown;
};

/** A config that carries merchant copy — the branch that gets rewritten. */
type WithMerchantCopy<TConfig> = TConfig & { merchantCopy: MerchantToastCopy };

/**
 * A real type guard rather than a cast. The runtime shape checks are not
 * redundant with the signature: the logger reaches this function through
 * `setToast`, which is still untyped, so a non-object can arrive at runtime
 * even though no typed caller can send one.
 */
function hasMerchantCopy<TConfig extends MerchantToastConfig>(
	config: TConfig
): config is WithMerchantCopy<TConfig> {
	return !!config && typeof config === 'object' && !!config.merchantCopy;
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
export function createMerchantToast<TConfig extends MerchantToastConfig, TResult>(
	t: TranslateError,
	show: (config: TConfig) => TResult
): (config: TConfig) => TResult {
	return (config: TConfig): TResult => {
		if (!hasMerchantCopy(config)) {
			return show(config);
		}

		const { merchantCopy, ...rest } = config;
		const { title, description } = resolveMerchantToastText(t, merchantCopy);

		const rewritten = {
			...rest,
			title,
			// An explicit `toast.text2` is the call site's own second sentence and
			// outranks the code's action hint.
			...(config.description === undefined && description !== undefined ? { description } : {}),
		};

		// The single cast at this boundary, and only because TypeScript cannot
		// express it: a rest-spread of a generic minus one key widens to an
		// anonymous object type, so it cannot prove that putting `title` back on
		// it reconstitutes `TConfig`. The constraint above pins `title` and
		// `description` to `string | undefined`, which is exactly what is written
		// here — nothing beyond that inference gap is being asserted.
		return show(rewritten as TConfig);
	};
}
