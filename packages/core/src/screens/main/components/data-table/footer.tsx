import * as React from 'react';

import { useObservableState } from 'observable-hooks';

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
	const { clear } = useCollectionReset(query.collection.name);
	const loading = useObservableState(active$, false);
	const total = useObservableState(total$, 0);
	const t = useT();

	return (
		<HStack className="border-border bg-muted border-t p-2">
			<HStack className="flex-1 justify-start [&>*]:flex-1">{children}</HStack>
			<HStack className="justify-end gap-0">
				<Text className="text-xs">
					{t('Showing {count} of {total}', { count, total, _tags: 'core' })}
				</Text>
				<SyncButton sync={sync} clear={clear} active={loading} />
			</HStack>
		</HStack>
	);
}
