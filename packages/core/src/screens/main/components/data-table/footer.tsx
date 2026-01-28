import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { Query, useReplicationState } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

const logger = getLogger(['wcpos', 'core', 'footer']);

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
	const total = useObservableState(total$, 0);
	const t = useT();

	// Debug: track total$ reference changes
	const prevTotal$Ref = React.useRef<typeof total$>(null);
	const total$Changed = prevTotal$Ref.current !== null && prevTotal$Ref.current !== total$;

	if (total$Changed) {
		logger.debug('[DEBUG_FOOTER] total$ reference changed!', {
			context: { queryId: query?.id },
		});
	}
	prevTotal$Ref.current = total$;

	// Debug: log every render with current values
	logger.debug('[DEBUG_FOOTER] render', {
		context: {
			queryId: query?.id,
			hasTotal$: !!total$,
			total$Changed,
			totalValue: total,
			loading,
		},
	});

	return (
		<HStack className="border-border bg-footer rounded-b-lg border-t p-2">
			<HStack className="flex-1 justify-start *:flex-1">{children}</HStack>
			<HStack className="justify-end gap-0">
				<Text className="text-xs">
					{t('Showing {count} of {total}', { count, total, _tags: 'core' })}
				</Text>
				<SyncButton sync={sync} clearAndSync={clearAndSync} active={loading} />
			</HStack>
		</HStack>
	);
}
