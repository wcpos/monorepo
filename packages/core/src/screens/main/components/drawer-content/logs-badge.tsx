import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Badge } from '@wcpos/components/badge';
import { markLogsRead, observeUnreadErrorCount } from '@wcpos/query/store-local';

import { useAppState } from '../../../../contexts/app-state';

/**
 * Count of error-level logs newer than the persisted last-viewed watermark.
 * markAsRead() advances the watermark (the logs route calls it on focus).
 */
export function useUnreadErrorCount() {
	const { storeDB } = useAppState();
	const count = useObservableState(
		React.useMemo(() => observeUnreadErrorCount(storeDB), [storeDB]),
		0
	);
	const markAsRead = React.useCallback(() => {
		void markLogsRead(storeDB).catch(() => undefined);
	}, [storeDB]);
	return { count, markAsRead };
}

/**
 * Small badge that shows the count of unread error logs.
 * Shows nothing when count is 0, but stays mounted so the first error is seen arriving.
 */
export function LogsBadge({ unread }: { unread: number }) {
	return (
		<View className="absolute -top-1 -right-0.5">
			<Badge count={unread} max={99} variant="destructive" size="sm" />
		</View>
	);
}
