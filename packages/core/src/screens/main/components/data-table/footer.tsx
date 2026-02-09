import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { Query, useReplicationState } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useCollectionReset } from '../../hooks/use-collection-reset';
import SyncButton from '../sync-button';

interface Props {
	children?: React.ReactNode;
	query: Query<any>;
	count: number;
}

/**
 *
 */
export function DataTableFooter({ children, query, count }: Props) {
	const { sync, active$, total$ } = useReplicationState(query);
	const { clearAndSync } = useCollectionReset(query.collection.name);
	const loading = useObservableState(active$, false);
	const total = useObservableState(total$ ?? of(0), 0);
	const t = useT();

	return (
		<HStack className="border-border bg-footer rounded-b-lg border-t p-2">
			<HStack className="flex-1 justify-start *:flex-1">{children}</HStack>
			<HStack className="justify-end gap-0">
				<Text className="text-xs">{t('common.showing_of', { shown: count, total })}</Text>
				<SyncButton sync={sync} clearAndSync={clearAndSync} active={loading} />
			</HStack>
		</HStack>
	);
}
