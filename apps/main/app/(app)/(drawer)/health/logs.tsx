import * as React from 'react';

import { useFocusEffect } from 'expo-router';

import { LogsScreen } from '@wcpos/core/screens/main/logs';

import { useMarkLogsAsRead } from '../../../../components/unread-logs';

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

	return <LogsScreen />;
}
