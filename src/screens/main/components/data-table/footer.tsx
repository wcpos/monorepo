import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useReplicationState, Query } from '@wcpos/query';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';

import { useT } from '../../../../contexts/translations';
import { useCollectionReset } from '../../hooks/use-collection-reset';
import SyncButton from '../sync-button';

interface Props {
	query: Query<any>;
	children: React.ReactNode;
	count: number;
}

/**
 *
 */
export const Footer = ({ query, children, count }: Props) => {
	const { sync, active$, total$ } = useReplicationState(query);
	const { clear } = useCollectionReset(query.collection.name);
	const loading = useObservableState(active$, false);
	const total = useObservableState(total$, 0);
	const t = useT();

	return (
		<HStack
			className="p-2 border-t bg-muted"
			// style={{
			// 	width: '100%',
			// 	backgroundColor: theme.colors.lightGrey,
			// 	borderBottomLeftRadius: theme.rounding.medium,
			// 	borderBottomRightRadius: theme.rounding.medium,
			// 	borderTopWidth: 1,
			// 	borderTopColor: theme.colors.grey,
			// }}
		>
			<HStack className="justify-start flex-1">{children}</HStack>
			<HStack className="justify-end flex-1">
				<Text className="text-sm">
					{t('Showing {count} of {total}', { count, total, _tags: 'core' })}
				</Text>
				<SyncButton sync={sync} clear={clear} active={loading} />
			</HStack>
		</HStack>
	);
};
