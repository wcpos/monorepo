import { OPEN_ORDER_STATUSES } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { orderLocked, type OrderLockReaders } from '../../../commands/paid-balance-boundary';
import { needsReferences } from '../../../commands/settlement-coordinator';
import { exemptCouponsSupported } from '../../../commands/tax-exempt';

import type { CurrentOrderRecord } from '../../../contexts/current-order';
import type { OrderPayload } from '../../../commands/cart-config-for-order';
import type { Deps } from '../../../commands/settle-cart-write';

/**
 * The Tax exempt row as `setTaxExempt` would answer a toggle now: hidden on an inclusive store,
 * otherwise the one reason it would refuse (its help line), or none.
 */
export function taxExemptRowState(
	payload: OrderPayload,
	record: CurrentOrderRecord,
	readers: OrderLockReaders & Pick<Deps<unknown>, 'configForOrder'>,
	dp: number,
	/** The store is reachable (`online-website-available`), as add-coupon reads it. */
	online: boolean,
	/** The store's WooCommerce version: coupons on an exempt order need 11.3 (woocommerce#69441). */
	wcVersion = ''
) {
	const hidden = readers.configForOrder(payload).pricesIncludeTax;
	const couponed = payload.coupon_lines?.some((line) => line.code != null);
	let reason: 'reopen' | 'offline' | 'payment' | 'wc_version' | undefined;
	if (!OPEN_ORDER_STATUSES.some((status) => status === payload.status)) reason = 'reopen';
	// A quick discount replays locally; only a store coupon needs its references.
	else if (!online && needsReferences({ payload })) reason = 'offline';
	else if (orderLocked(payload, record, readers, dp, { allowNew: true, allowDurableHint: true }))
		reason = 'payment';
	// Turning the exemption on; turning it off is always supported.
	else if (
		!wooMetaCarrier.vatExempt(payload.meta_data) &&
		couponed &&
		!exemptCouponsSupported(wcVersion)
	)
		reason = 'wc_version';
	return { hidden, disabled: !!reason, reason };
}
