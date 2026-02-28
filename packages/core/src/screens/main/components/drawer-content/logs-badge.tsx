import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Badge } from '@wcpos/components/badge';
import { useQueryManager } from '@wcpos/query';

/**
 * Hook that tracks the count of error-level logs since a given timestamp.
 * When the user views the Logs screen, call markAsRead() to reset.
 */
export function useUnreadErrorCount() {
	const manager = useQueryManager();
	const logsCollection = (manager.localDB as any).collections.logs;
	const [lastViewedTimestamp, setLastViewedTimestamp] = React.useState(() => Date.now());

	const count = useObservableState(
		React.useMemo(
			() =>
				logsCollection.count({
					selector: {
						level: { $eq: 'error' },
						timestamp: { $gt: lastViewedTimestamp },
					},
				}).$,
			[logsCollection, lastViewedTimestamp]
		),
		0
	);

	const markAsRead = React.useCallback(() => {
		setLastViewedTimestamp(Date.now());
	}, []);

	return { count, markAsRead };
}

/**
 * Small badge that shows the count of unread error logs.
 * Renders nothing when count is 0.
 */
export function LogsBadge({ count }: { count: number }) {
	if (count === 0) return null;

	return (
		<View className="absolute -top-1 -right-0.5">
			<Badge count={count} max={99} variant="destructive" size="sm" />
		</View>
	);
}
