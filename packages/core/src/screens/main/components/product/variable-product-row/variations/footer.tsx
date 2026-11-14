import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, type QueryHandle, useRecordField } from '@wcpos/query';

import { useT } from '../../../../../../contexts/translations';
import { useQueryHandleFields } from '../../../../../../query';
import { SyncButton } from '../../../../components/sync-button';
import { useCollectionReset } from '../../../../hooks/use-collection-reset';

interface VariationTableFooterProps {
	/** The live handle the row owns: the sync button acts on it and spins with it. */
	handle: QueryHandle;
	/** The handle whose variations are drawn, so the total describes the `drawnCount` beside it. */
	shown?: QueryHandle;
	parent: EngineRecord<'products'>;
	drawnCount: number;
}

/**
 *
 */
export function VariationTableFooter({
	handle,
	shown = handle,
	parent,
	drawnCount,
}: VariationTableFooterProps) {
	const { active: loading } = useQueryHandleFields(handle, ['active']);
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
		return handle.sync();
	}, [handle, clearAndSync]);

	/**
	 * The parent product's own payload names every variation the server has, so it is the
	 * authoritative denominator here — INCLUDING a genuine zero, which is why an empty list
	 * must not fall through to the local count (CodeRabbit, #1492).
	 *
	 * It can still be stale, so it never claims fewer variations than are on screen: the same
	 * resident-count floor `coverageProjectionWithResult$` applies to every other footer. Without
	 * it a parent whose payload had not caught up would read "Showing 2 of 0".
	 *
	 * With no parent list at all, the drawn handle's `total` carries the answer — and it is null
	 * when nothing vouches for a size, in which case the footer states the count alone rather
	 * than passing the loaded-row count off as a total. (The drawn handle has answered: the
	 * footer renders only under a reader that has returned from `useQuerySnapshot(shown)`.)
	 */
	const { total: localTotal } = useQueryHandleFields(shown, ['total']);
	const parentVariations = useRecordField(parent, (record) => record.payload.variations);
	const parentCount = parentVariations?.length;
	const total = parentCount === undefined ? localTotal : Math.max(parentCount, drawnCount);
	const t = useT();

	return (
		<HStack space="xs" className="border-border justify-end border-b p-2">
			<Text className="text-xs">
				{total === null
					? t('common.showing_n', { shown: drawnCount.toLocaleString() })
					: t('common.showing_of', {
							shown: drawnCount.toLocaleString(),
							total: total.toLocaleString(),
						})}
			</Text>
			<SyncButton sync={handle.sync} clearAndSync={handleClearVariations} active={loading} />
		</HStack>
	);
}
