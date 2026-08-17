import { type RemoteId, wooIdOf } from '@wcpos/sync-core';

export function engineDocumentIdFor(entity: 'product' | 'variation', remoteId: RemoteId): string {
	return `woo-${entity}:${wooIdOf(remoteId)}`;
}
