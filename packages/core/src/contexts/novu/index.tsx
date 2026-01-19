import * as React from 'react';

import log from '@wcpos/utils/logger';

import { useAppState } from '../app-state';
import { useLocale } from '../../hooks/use-locale';
import {
	generateSubscriberId,
	generateSubscriberMetadata,
	type NovuSubscriberMetadata,
	syncSubscriberToServer,
} from '../../services/novu/subscriber';

/**
 * Novu configuration - hardcoded since these are public values
 * pointing to our self-hosted Novu instance.
 *
 * Uses Production environment by default. Set environment variables
 * to use Development environment for testing:
 * - Expo: EXPO_PUBLIC_NOVU_APPLICATION_ID
 * - Electron: NOVU_APPLICATION_ID
 */
const NOVU_CONFIG = {
	applicationIdentifier:
		process.env.EXPO_PUBLIC_NOVU_APPLICATION_ID ||
		process.env.NOVU_APPLICATION_ID ||
		'Wu5i9hEUNMO2',
	backendUrl:
		process.env.EXPO_PUBLIC_NOVU_API_URL ||
		process.env.NOVU_API_URL ||
		'https://api.notifications.wcpos.com',
	socketUrl:
		process.env.EXPO_PUBLIC_NOVU_SOCKET_URL ||
		process.env.NOVU_SOCKET_URL ||
		'wss://ws.notifications.wcpos.com',
};

export interface NovuContextValue {
	/** The unique subscriber ID for this user/store/site combination */
	subscriberId: string | null;
	/** Metadata about the subscriber for targeting */
	subscriberMetadata: NovuSubscriberMetadata | null;
	/** Novu configuration */
	config: typeof NOVU_CONFIG;
	/** Whether Novu is properly configured */
	isConfigured: boolean;
}

const NovuContext = React.createContext<NovuContextValue | undefined>(undefined);

interface NovuProviderProps {
	children: React.ReactNode;
}

/**
 * NovuProvider wraps the app with Novu notification context.
 *
 * It generates a unique subscriber ID based on:
 * - site.domain
 * - store.id
 * - wpCredentials.uuid
 * - platform (to allow multiple simultaneous logins)
 *
 * This provider should be placed inside AppStateProvider so it has access
 * to site, store, and wpCredentials.
 */
export function NovuProvider({ children }: NovuProviderProps) {
	const { site, store, wpCredentials } = useAppState();
	const { locale } = useLocale();

	const value = React.useMemo<NovuContextValue>(() => {
		// Check if we have all required data to generate subscriber ID
		if (!site || !store || !wpCredentials) {
			return {
				subscriberId: null,
				subscriberMetadata: null,
				config: NOVU_CONFIG,
				isConfigured: false,
			};
		}

		const subscriberId = generateSubscriberId(site, store, wpCredentials);
		const subscriberMetadata = generateSubscriberMetadata(site, store);

		return {
			subscriberId,
			// Use locale from useLocale (e.g., 'en_US' - Novu's expected format)
			subscriberMetadata: { ...subscriberMetadata, locale },
			config: NOVU_CONFIG,
			isConfigured: true,
		};
	}, [site, store, wpCredentials, locale]);

	/**
	 * Sync subscriber metadata to the server when subscriber is configured.
	 * This ensures the Novu subscriber profile is up-to-date with the latest
	 * metadata (license status, versions, etc.) every time the app opens.
	 */
	React.useEffect(() => {
		if (!value.isConfigured || !value.subscriberId || !value.subscriberMetadata) {
			return;
		}

		log.debug('Novu: Syncing subscriber metadata to server', {
			context: { subscriberId: value.subscriberId },
		});

		syncSubscriberToServer(value.subscriberId, value.subscriberMetadata)
			.then((result) => {
				if (result.success) {
					log.info('Novu: Subscriber metadata synced successfully');
				} else {
					log.warn('Novu: Failed to sync subscriber metadata', {
						context: { error: result.error },
					});
				}
			})
			.catch((error) => {
				log.error('Novu: Error syncing subscriber metadata', {
					context: { error: error instanceof Error ? error.message : String(error) },
				});
			});
	}, [value.isConfigured, value.subscriberId, value.subscriberMetadata]);

	return <NovuContext.Provider value={value}>{children}</NovuContext.Provider>;
}

/**
 * Hook to access Novu context
 */
export function useNovu() {
	const context = React.useContext(NovuContext);
	if (!context) {
		throw new Error('useNovu must be used within a NovuProvider');
	}
	return context;
}
