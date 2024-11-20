import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useDataTable } from '@wcpos/components/src/data-table';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { useReplicationState } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useCollectionReset } from '../../hooks/use-collection-reset';
import SyncButton from '../sync-button';

interface Props {
	children: React.ReactNode;
}

/**
 *
 */
export const DataTableFooter = ({ children }: Props) => {
	const { query, count, ...rest } = useDataTable();
	const { sync, active$, total$ } = useReplicationState(query);
	const { clear } = useCollectionReset(query.collection.name);
	const loading = useObservableState(active$, false);
	const total = useObservableState(total$, 0);
	const t = useT();

	return (
		<HStack className="p-2 border-border border-t bg-muted">
			<HStack className="justify-start flex-1 [&>*]:flex-1">{children}</HStack>
			<HStack className="justify-end gap-0">
				<Text className="text-xs">
					{t('Showing {count} of {total}', { count, total, _tags: 'core' })}
				</Text>
				<SyncButton sync={sync} clear={clear} active={loading} />
			</HStack>
		</HStack>
	);
};
