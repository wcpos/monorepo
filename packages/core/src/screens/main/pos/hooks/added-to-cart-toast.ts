import { Toast } from '@wcpos/components/toast';

import type { useT } from '../../../../contexts/translations';

/**
 * Every add-to-cart toast shares this id, so a burst of adds updates ONE toast in place and
 * restarts its timer (sonner and sonner-native both do this for a reused id) instead of stacking.
 * A stack of them covered the top product row on the iPad and took the cashier's taps (#2370).
 */
export const ADDED_TO_CART_TOAST_ID = 'pos-added-to-cart';

// The libraries' own default lifetime, stated so the count below resets with the toast.
export const ADDED_TO_CART_DURATION = 4000;

let count = 0;
let lastAddAt = 0;

const resetCount = () => {
	count = 0;
};

/**
 * Shows, or updates, the one added-to-cart toast. The first add names the product; later adds
 * while it is open show a running count of items, without a name.
 *
 * The count also resets when the duration has passed since the last add, because closing callbacks
 * do not fire when the toaster itself goes away.
 */
export function showAddedToCartToast(t: ReturnType<typeof useT>, name: string | undefined) {
	const now = Date.now();
	if (now - lastAddAt > ADDED_TO_CART_DURATION) resetCount();
	count += 1;
	lastAddAt = now;

	Toast.show({
		id: ADDED_TO_CART_TOAST_ID,
		type: 'success',
		title:
			count > 1 ? t('common.added_to_cart_count', { count }) : t('common.added_to_cart', { name }),
		duration: ADDED_TO_CART_DURATION,
		onDismiss: resetCount,
		onAutoClose: resetCount,
	});
}
