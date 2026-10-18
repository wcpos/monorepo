import * as React from 'react';

import { useFocusEffect } from 'expo-router';

import { loadRest } from '@wcpos/core/screens/main/rest/lazy';

import { useMarkLogsAsRead } from '../../../../components/unread-logs';

const Screen = React.lazy(() => loadRest().then((m) => ({ default: m.LogsScreen })));

/** Rendered inside the Suspense boundary, so it only marks the logs read once they are on screen. */
function MarkLogsRead() {
	const markAsRead = useMarkLogsAsRead();

	useFocusEffect(
		React.useCallback(() => {
			markAsRead();
		}, [markAsRead])
	);

	return null;
}

/**
 * The unread-error badge clears only when the logs themselves are viewed —
 * visiting Database or Performance must not mark errors as read.
 */
export default function HealthLogsRoute() {
	return (
		<React.Suspense fallback={null}>
			<Screen />
			<MarkLogsRead />
		</React.Suspense>
	);
}
