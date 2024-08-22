import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useReplicationState } from '@wcpos/query';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';

import { useT } from '../../../contexts/translations';
import SyncButton from '../components/sync-button';
import { useCollectionReset } from '../hooks/use-collection-reset';

/**
 *
 */
export const TaxRatesFooter = ({ count, query }) => {
	const { sync, active$, total$ } = useReplicationState(query);
	const { clear } = useCollectionReset(query.collection.name);
	const active = useObservableState(active$, false);
	const total = useObservableState(total$, 0);
	const t = useT();

	return (
		<HStack className="p-2 gap-0 border-border border-t bg-muted justify-end">
			<Text className="text-xs">
				{t('Showing {count} of {total}', { count, total, _tags: 'core' })}
			</Text>
			<SyncButton sync={sync} clear={clear} active={active} />
		</HStack>
	);
};
