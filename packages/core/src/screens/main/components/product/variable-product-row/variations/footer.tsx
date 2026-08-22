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
	// eslint-disable-next-line wcpos/no-dollar-getter-into-observable-hooks -- Query binding exposes a stable stream property, not an RxDB $-getter; exception dated 2026-08-21.
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
	 * The parent product's own payload names every variation the server has, so it is the
	 * authoritative denominator here — INCLUDING a genuine zero, which is why an empty list
	 * must not fall through to the local count (CodeRabbit, #1492).
	 *
	 * It can still be stale, so it never claims fewer variations than are on screen: the same
	 * resident-count floor `coverageProjection$` applies to every other footer. Without it a
	 * parent whose payload had not caught up would read "Showing 2 of 0".
	 *
	 * With no parent list at all, `binding.total$` carries the answer — and it is null when
	 * nothing vouches for a size (see QueryBinding.total$), in which case the footer states
	 * the count alone rather than passing the loaded-row count off as a total.
	 */
	// eslint-disable-next-line wcpos/no-dollar-getter-into-observable-hooks -- Query binding exposes a stable stream property, not an RxDB $-getter; exception dated 2026-08-21.
	const localTotal = useObservableState(binding.total$, null);
	const parentVariations = useRecordField(parent, (record) => record.payload.variations);
	const parentCount = parentVariations?.length;
	const total = parentCount === undefined ? localTotal : Math.max(parentCount, count);
	const t = useT();

	return (
		<HStack space="xs" className="border-border bg-footer justify-end border-b p-2">
			<Text className="text-xs">
				{total === null
					? t('common.showing_n', { shown: count.toLocaleString() })
					: t('common.showing_of', {
							shown: count.toLocaleString(),
							total: total.toLocaleString(),
						})}
			</Text>
			<SyncButton sync={binding.sync} clearAndSync={handleClearVariations} active={loading} />
		</HStack>
	);
}
