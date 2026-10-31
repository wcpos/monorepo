import { OPEN_ORDER_STATUSES } from '@wcpos/query';

import { orderLocked, type OrderLockReaders } from '../../../commands/paid-balance-boundary';

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
	online: boolean
) {
	const hidden = readers.configForOrder(payload).pricesIncludeTax;
	let reason: 'reopen' | 'offline' | 'payment' | undefined;
	if (!OPEN_ORDER_STATUSES.some((status) => status === payload.status)) reason = 'reopen';
	else if (!online && payload.coupon_lines?.some((line) => line.code != null)) reason = 'offline';
	else if (orderLocked(payload, record, readers, dp, { allowNew: true, allowDurableHint: true }))
		reason = 'payment';
	return { hidden, disabled: !!reason, reason };
}
