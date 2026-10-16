import { POS_META_KEYS } from '@wcpos/sync-core';

export function isCartAttributed(order?: { meta_data?: readonly { key?: string }[] }) {
	return !!order?.meta_data?.some(({ key }) => key === POS_META_KEYS.register);
}
