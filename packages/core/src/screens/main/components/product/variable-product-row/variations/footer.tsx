import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useReplicationState } from '@wcpos/query';

import { useAppState } from '../../../../../../contexts/app-state';
import { useT } from '../../../../../../contexts/translations';
import SyncButton from '../../../../components/sync-button';

/**
 *
 */
export const VariationTableFooter = ({ query, parent, count }) => {
	const { fastStoreDB, storeDB } = useAppState();
	const { sync, active$ } = useReplicationState(query);
	const loading = useObservableState(active$, false);

	/**
	 *
	 */
	const handleClearVariations = React.useCallback(async () => {
		await storeDB.collections.variations.find({ selector: { parent_id: parent.id } }).remove();
		await fastStoreDB.collections.variations
			.find({ selector: { endpoint: 'products/' + parent.id + '/variations' } })
			.remove();
		return sync();
	}, [fastStoreDB, storeDB, parent.id, sync]);

	/**
	 * Get total from sync collection
	 */
	const total = useObservableState(
		fastStoreDB.collections.variations.count({
			selector: { endpoint: 'products/' + parent.id + '/variations' },
		}).$,
		0
	);
	const t = useT();

	return (
		<HStack space="xs" className="border-border bg-footer justify-end border-b p-2">
			<Text className="text-xs">
				{t('Showing {count} of {total}', { count, total })}
			</Text>
			<SyncButton sync={sync} clear={handleClearVariations} active={loading} />
		</HStack>
	);
};
