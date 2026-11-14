import { POS_META_KEYS } from '@wcpos/sync-core';

import { cartRestartsOnAdd } from '../../screens/main/pos/hooks/cart-restart';

type Cart = Parameters<typeof cartRestartsOnAdd>[0];

/**
 * Only a restartable empty template can safely rebind its register on the next add (#2609).
 */
export function isCartAttributed(order?: Cart) {
	return (
		!!order &&
		!cartRestartsOnAdd(order) &&
		!!order.meta_data?.some(({ key }) => key === POS_META_KEYS.register)
	);
}
