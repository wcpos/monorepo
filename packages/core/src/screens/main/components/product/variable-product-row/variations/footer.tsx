import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useQueryRuntime } from '@wcpos/query';
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
	const runtime = useQueryRuntime();
	const loading = useObservableEagerState(binding.active$);

	/**
	 *
	 */
	const handleClearVariations = React.useCallback(async () => {
		const scope = runtime.engine.active() ?? (await runtime.engine.ready);
		const variations = await scope.database.collections.variations
			.find({ selector: { parentId: parent.id } })
			.exec();
		for (const variation of variations) {
			await runtime.engine.write({
				collection: 'variations',
				operation: 'delete',
				recordId: String(variation.primary),
			});
		}
		return binding.sync();
	}, [binding, runtime, parent.id]);

	/**
	 * Prefer the parent product's server variation ids over the local collection total.
	 */
	const localTotal = useObservableState(binding.total$, 0);
	const parentVariations = useObservableEagerState(parent.variations$!);
	const total = parentVariations?.length ? parentVariations.length : localTotal;
	const t = useT();

	return (
		<HStack space="xs" className="border-border bg-footer justify-end border-b p-2">
			<Text className="text-xs">{t('common.showing_of', { shown: count, total })}</Text>
			<SyncButton sync={binding.sync} clearAndSync={handleClearVariations} active={loading} />
		</HStack>
	);
}
