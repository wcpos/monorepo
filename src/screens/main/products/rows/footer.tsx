import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useReplicationState } from '@wcpos/query';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import SyncButton from '../../components/sync-button';
import { useCollectionReset } from '../../hooks/use-collection-reset';

/**
 *
 */
export const VariationTableFooter = ({ query, parent, count }) => {
	const { fastStoreDB } = useAppState();
	const { sync, active$ } = useReplicationState(query);
	const { clear } = useCollectionReset(query.collection.name);
	const loading = useObservableState(active$, false);

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
		<HStack space="xs" className="p-2 justify-end border-t-1 bg-grey-100">
			<Text className="text-sm">
				{t('Showing {count} of {total}', { count, total, _tags: 'core' })}
			</Text>
			<SyncButton sync={sync} clear={clear} active={loading} />
		</HStack>
	);
};
