import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useQueryManager } from '@wcpos/query';
import type { ProductDocument } from '@wcpos/database';

import { useT } from '../../../../../../contexts/translations';
import { SyncButton } from '../../../../components/sync-button';

interface VariationTableFooterProps {
	binding: Pick<
		ReturnType<typeof import('../../../../../../query').useCollectionBinding<'variations'>>,
		'sync' | 'active$' | 'total$'
	>;
	parent: ProductDocument;
	count: number;
}

/**
 *
 */
export function VariationTableFooter({ binding, parent, count }: VariationTableFooterProps) {
	const manager = useQueryManager();
	const loading = useObservableEagerState(binding.active$);

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
		return binding.sync();
	}, [binding, manager, parent.id]);

	/**
	 * Get total from sync collection
	 */
	const total = useObservableState(binding.total$, 0);
	const t = useT();

	return (
		<HStack space="xs" className="border-border bg-footer justify-end border-b p-2">
			<Text className="text-xs">{t('common.showing_of', { shown: count, total })}</Text>
			<SyncButton sync={binding.sync} clearAndSync={handleClearVariations} active={loading} />
		</HStack>
	);
}
