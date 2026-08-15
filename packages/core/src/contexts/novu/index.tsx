import * as React from 'react';

import { NovuConfigProvider } from './config';
import { NovuNotificationsProvider } from './notifications';

interface NovuProviderProps {
	children: React.ReactNode;
}

/**
 * NovuProvider wraps the app with Novu notification context.
 *
 * Two layers:
 * 1. `NovuConfigProvider` - resolves the subscriber identity for the current session.
 * 2. `NovuNotificationsProvider` - the single owner of the Novu bootstrap (client, WebSocket,
 *    initial fetch, subscriber metadata sync) and of the shared notification state.
 *
 * This provider should be placed inside AppStateProvider so it has access
 * to site, store, and wpCredentials.
 */
export function NovuProvider({ children }: NovuProviderProps) {
	return (
		<NovuConfigProvider>
			<NovuNotificationsProvider>{children}</NovuNotificationsProvider>
		</NovuConfigProvider>
	);
}

export { useNovu, type NovuContextValue } from './config';
export {
	useNovuNotifications,
	useNovuNotificationsSummary,
	type Notification,
	type NovuNotificationsList,
	type NovuNotificationsSummary,
	type UseNovuNotificationsResult,
} from './notifications';

// Re-export syncSubscriberToServer for callers that need a direct sync
export { syncSubscriberToServer } from '../../services/novu/subscriber';
