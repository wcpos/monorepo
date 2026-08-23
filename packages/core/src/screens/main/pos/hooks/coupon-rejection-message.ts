import * as React from 'react';

import type { CouponRejection } from '@wcpos/order-math/internal';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../hooks/use-current-order-currency-format';

/**
 * Turns a typed `CouponRejection` into the sentence the cashier reads.
 *
 * Replaces `coupon-rejection-strings.ts`, which mapped the same codes to
 * hardcoded English and shipped it to every store regardless of language — the
 * one place in the coupon flow where untranslated copy reached the counter
 * beside translated copy (#1472).
 *
 * ── Why a switch rather than a code → key lookup ─────────────────────────────
 *
 * A `Record<CouponRejectionCode, string>` fed to `t(key)` would be tidier and
 * would not work: `scripts/extract-js-strings.js` finds translatable strings by
 * matching `t('literal')` in source, so a key assembled at runtime never enters
 * the catalogue and ships missing. Every key below is a literal for that reason.
 *
 * The `never` check in the default branch is load-bearing too — a twelfth
 * rejection code added upstream fails compilation here rather than reaching a
 * cashier as a raw enum.
 */
export function useCouponRejectionMessage() {
	const t = useT();
	// The ORDER's currency, not the store's. An open order carries its own
	// `currency_symbol`, and every other amount on the cart surface — totals,
	// line totals, taxes, the Pay button — formats through this hook. A spend
	// threshold quoted in the store symbol beside a cart quoted in the order's
	// would be two currencies in one glance.
	const { format } = useCurrentOrderCurrencyFormat();

	return React.useCallback(
		(rejection: CouponRejection): string => {
			switch (rejection.code) {
				case 'already_applied':
					return t('pos_cart.coupon_rejected_already_applied');
				case 'expired':
					return t('pos_cart.coupon_rejected_expired');
				case 'usage_limit_reached':
					return t('pos_cart.coupon_rejected_usage_limit');
				case 'usage_limit_reached_for_customer':
					return t('pos_cart.coupon_rejected_usage_limit_customer');
				case 'minimum_spend_not_met':
					// The amount arrives as a bare decimal off the coupon record. The old
					// English rendered it raw — "Minimum spend of 50.00 not met" — an
					// amount in no particular currency, on a till that knows exactly
					// which one it takes.
					return t('pos_cart.coupon_rejected_minimum_spend', {
						amount: format(Number(rejection.params?.amount ?? 0)),
					});
				case 'maximum_spend_exceeded':
					return t('pos_cart.coupon_rejected_maximum_spend', {
						amount: format(Number(rejection.params?.amount ?? 0)),
					});
				case 'individual_use':
					// `params.code` is the coupon being ADDED: it is individual-use and the
					// cart already holds others.
					return t('pos_cart.coupon_rejected_individual_use', {
						code: String(rejection.params?.code ?? ''),
					});
				case 'individual_use_conflict':
					// `params.code` is the coupon ALREADY APPLIED. Naming it is the whole
					// value of the message — it tells the cashier which one to remove.
					return t('pos_cart.coupon_rejected_individual_use_conflict', {
						code: String(rejection.params?.code ?? ''),
					});
				case 'email_required':
					return t('pos_cart.coupon_rejected_email_required');
				case 'email_not_allowed':
					return t('pos_cart.coupon_rejected_email_not_allowed');
				case 'not_applicable_to_cart':
					// Deliberately says the coupon cannot be applied to THIS CART, not
					// that nothing in the cart qualifies. The validator emits this code
					// from two places, and the second one (validate.ts step 9b —
					// `fixed_cart` + `exclude_sale_items` with any sale item present)
					// fires even when eligible non-sale items are in the cart. Claiming
					// nothing qualifies would be false there, and would hide the fact
					// that removing the sale item makes the coupon work.
					return t('pos_cart.coupon_rejected_not_applicable');
				default: {
					const _exhaustive: never = rejection.code;
					return String(_exhaustive);
				}
			}
		},
		[format, t]
	);
}
