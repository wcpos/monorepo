import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';
import { of } from 'rxjs';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useQueryManager, useReplicationState } from '@wcpos/query';
import type { ProductDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../../../contexts/translations';
import { SyncButton } from '../../../../components/sync-button';

interface VariationTableFooterProps {
	query: Query<import('@wcpos/database').ProductVariationCollection>;
	parent: ProductDocument;
	count: number;
}

/**
 *
 */
export function VariationTableFooter({ query, parent, count }: VariationTableFooterProps) {
	const manager = useQueryManager();
	const { sync, active$, total$ } = useReplicationState(query);
	const loading = useObservableEagerState(active$);

	/**
	 *
	 */
	const handleClearVariations = React.useCallback(async () => {
		const scope = manager.engine.active() ?? (await manager.engine.ready);
		const variations = await scope.database.collections.variations
			.find({ selector: { parentId: parent.id } })
			.exec();
		for (const variation of variations) {
			await manager.engine.write({
				collection: 'variations',
				operation: 'delete',
				recordId: String(variation.primary),
			});
		}
		return sync();
	}, [manager, parent.id, sync]);

	/**
	 * Get total from sync collection
	 */
	const total = useObservableState(total$ ?? of(0), 0);
	const t = useT();

	return (
		<HStack space="xs" className="border-border bg-footer justify-end border-b p-2">
			<Text className="text-xs">{t('common.showing_of', { shown: count, total })}</Text>
			<SyncButton sync={sync} clearAndSync={handleClearVariations} active={loading} />
		</HStack>
	);
}
