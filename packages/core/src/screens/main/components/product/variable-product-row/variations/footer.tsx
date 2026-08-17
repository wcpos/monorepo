import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../../../contexts/translations';
import { SyncButton } from '../../../../components/sync-button';
import { useCollectionReset } from '../../../../hooks/use-collection-reset';

interface VariationTableFooterProps {
	binding: Pick<
		ReturnType<typeof import('../../../../../../query').useCollectionBinding<'variations'>>,
		'sync' | 'active$' | 'total$'
	>;
	parent: EngineRecord<'products'>;
	count: number;
}

/**
 *
 */
export function VariationTableFooter({ binding, parent, count }: VariationTableFooterProps) {
	const loading = useObservableEagerState(binding.active$);
	const { clearAndSync } = useCollectionReset('variations');

	/**
	 * Local cache eviction ONLY (#1093): the guarded reset funnel drops the local
	 * variations collection and refills — it never enqueues mutations, and a
	 * pending variation edit makes it return needs-confirmation instead of
	 * destroying the queue. `engine.write({operation:'delete'})` is a durable
	 * SERVER delete and must never appear in a refresh affordance.
	 */
	const handleClearVariations = React.useCallback(async () => {
		await clearAndSync();
		return binding.sync();
	}, [binding, clearAndSync]);

	/**
	 * Prefer the parent product's server variation ids over the local collection total.
	 */
	const localTotal = useObservableState(binding.total$, 0);
	const parentVariations = useRecordField(parent, (record) => record.payload.variations);
	const total = parentVariations?.length ? parentVariations.length : localTotal;
	const t = useT();

	return (
		<HStack space="xs" className="border-border bg-footer justify-end border-b p-2">
			<Text className="text-xs">{t('common.showing_of', { shown: count, total })}</Text>
			<SyncButton sync={binding.sync} clearAndSync={handleClearVariations} active={loading} />
		</HStack>
	);
}
