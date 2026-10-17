import * as React from 'react';

import { useFocusEffect } from 'expo-router';

import { loadRest } from '@wcpos/core/screens/main/rest/lazy';

import { useMarkLogsAsRead } from '../../../../components/unread-logs';

const Screen = React.lazy(() => loadRest().then((m) => ({ default: m.LogsScreen })));

/**
 * The unread-error badge clears only when the logs themselves are viewed —
 * visiting Database or Performance must not mark errors as read.
 */
export default function HealthLogsRoute() {
	const markAsRead = useMarkLogsAsRead();

	useFocusEffect(
		React.useCallback(() => {
			markAsRead();
		}, [markAsRead])
	);

	return (
		<React.Suspense fallback={null}>
			<Screen />
		</React.Suspense>
	);
}
