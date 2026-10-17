import { POS_META_KEYS } from '@wcpos/sync-core';

import { isCartEmpty } from '../../screens/main/pos/hooks/cart-restart';

type Cart = Parameters<typeof isCartEmpty>[0] & { meta_data?: readonly { key?: string }[] };

/**
 * A cart that has begun under a register: stamped with one AND holding live lines. The empty
 * template is stamped at seeding, so the stamp alone would lock Switch register forever (#2609).
 */
export function isCartAttributed(order?: Cart) {
	return (
		!!order &&
		!isCartEmpty(order) &&
		!!order.meta_data?.some(({ key }) => key === POS_META_KEYS.register)
	);
}
