import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useReplicationState } from '@wcpos/query';

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
		<HStack className="border-border bg-footer justify-end gap-0 border-t p-2">
			<Text className="text-xs">{t('Showing {count} of {total}', { count, total })}</Text>
			<SyncButton sync={sync} clear={clear} active={active} />
		</HStack>
	);
};
