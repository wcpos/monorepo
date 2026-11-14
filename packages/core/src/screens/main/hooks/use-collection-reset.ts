import * as React from 'react';

import { Toast } from '@wcpos/components/toast';
import { COLLECTION_VOCABULARY, resetCollectionsAndRefill, useQueryRuntime } from '@wcpos/query';
import type { SyncCollectionName } from '@wcpos/sync-engine';
import { getLogger } from '@wcpos/utils/logger';
import type { LegacyCollectionName } from '@wcpos/query';
import type { CollectionKey as QueryCollectionKey } from '@wcpos/query/query-state';

import { useT } from '../../../contexts/translations';

export type CollectionKey = LegacyCollectionName | QueryCollectionKey;

const logger = getLogger(['wcpos', 'hooks', 'useCollectionReset']);

const ENGINE_COLLECTIONS = Object.fromEntries(
	Object.entries(COLLECTION_VOCABULARY).map(([name, row]) => [row.legacyName, name])
) as Partial<Record<CollectionKey, SyncCollectionName>>;

/** Engine-owned reset funnel. A pending mutation queue is never destroyed implicitly: the
 * engine's `needs-confirmation` outcome is warned about without refilling. */
export const useCollectionReset = (key: CollectionKey) => {
	const runtime = useQueryRuntime();
	const t = useT();
	const clearAndSync = React.useCallback(async (): Promise<void> => {
		logger.debug('clearAndSync: starting', { context: { key } });
		const engineName = ENGINE_COLLECTIONS[key];
		if (!engineName) throw new Error(`Collection "${key}" cannot be engine-reset`);
		const outcome = await resetCollectionsAndRefill(runtime.engine, engineName);
		if (outcome === 'needs-confirmation') {
			// Never cleared: the engine refuses to drop unsent changes, and its own row
			// (engine.reset-needs-confirmation) records it. The cashier pressed the
			// button, so say why nothing happened instead of looking broken.
			logger.debug('clearAndSync: reset needs confirmation', {
				context: { collectionName: key },
			});
			Toast.show({
				type: 'warning',
				title: t('common.clear_blocked_unsent'),
				description: t('common.clear_blocked_unsent_hint'),
			});
			return;
		}
		logger.debug('clearAndSync: complete', { context: { key } });
	}, [key, runtime.engine, t]);

	return { clearAndSync };
};
