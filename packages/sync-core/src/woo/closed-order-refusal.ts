import { POS_META_KEYS } from '../pos-carrier/carrier';
import { isPaidStatus } from './moneyCommandAnswer';

/**
 * Whether a refusal's `data.order_status` names an order the store has closed: a paid sale, or a
 * cancelled or refunded one; `failed`, `pending` and the open POS carts are not (Sentry POS-338).
 */
export function isClosedOrderStatus(status: unknown): boolean {
	return isPaidStatus(status) || status === 'cancelled' || status === 'refunded';
}

/** A `posData` meta value (an object or its JSON) that marks a rounding fee. */
function marksRounding(value: unknown): boolean {
	try {
		return Boolean((typeof value === 'string' ? JSON.parse(value) : value)?.rounding);
	} catch {
		return false;
	}
}

/** The `total` of the payload's first rounding fee line; a `name: null` fee is a sweep tombstone. */
export function roundingFeeAmount(payload: unknown): string | undefined {
	const feeLines = (payload as { fee_lines?: unknown } | null)?.fee_lines;
	const fee = (Array.isArray(feeLines) ? feeLines : []).find(
		(line) =>
			line?.name !== null &&
			line?.meta_data?.some?.(
				(m: { key?: unknown; value?: unknown }) =>
					m?.key === POS_META_KEYS.posData && marksRounding(m?.value)
			)
	);
	return fee?.total === undefined ? undefined : String(fee.total);
}
