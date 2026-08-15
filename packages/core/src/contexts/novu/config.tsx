import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import { useAppState } from '../app-state';
import { useLocale } from '../../hooks/use-locale';
import {
	generateSubscriberId,
	generateSubscriberMetadata,
	type NovuSubscriberMetadata,
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

/**
 * Stand-in for "no document yet". Module scope so it keeps a stable identity —
 * `useObservableEagerState` keys its subscription on the observable, so an inline `of()`
 * here would resubscribe on every render.
 */
const UNDEFINED$ = of(undefined);

interface NovuConfigProviderProps {
	children: React.ReactNode;
}

/**
 * NovuConfigProvider resolves the Novu subscriber identity for the current session.
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
export function NovuConfigProvider({ children }: NovuConfigProviderProps) {
	const { site, store, wpCredentials } = useAppState();
	const { locale } = useLocale();

	/**
	 * Subscribed, not read off the documents.
	 *
	 * The metadata used to be built by handing `generateSubscriberMetadata` the site and
	 * store documents, with the memo keyed on document IDENTITY. Every field it reads —
	 * licence key and status, plugin versions, store locale — was therefore a plain read: a
	 * licence renewal or a plugin upgrade written to the same document regenerated nothing
	 * and never resynced to Novu, so a merchant could sit on stale targeting metadata
	 * indefinitely.
	 */
	const siteUrl = useObservableEagerState(site?.url$ ?? UNDEFINED$) as string | undefined;
	const license = useObservableEagerState(site?.license$ ?? UNDEFINED$) as
		{ key?: string; status?: string } | undefined;
	const wcposVersion = useObservableEagerState(site?.wcpos_version$ ?? UNDEFINED$) as
		string | undefined;
	const wcposProVersion = useObservableEagerState(site?.wcpos_pro_version$ ?? UNDEFINED$) as
		string | undefined;
	const storeId = useObservableEagerState(store?.id$ ?? UNDEFINED$) as number | undefined;
	const storeLocalID = useObservableEagerState(store?.localID$ ?? UNDEFINED$) as string | undefined;
	const storeLocale = useObservableEagerState(store?.locale$ ?? UNDEFINED$) as string | undefined;

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
		const subscriberMetadata = generateSubscriberMetadata({
			siteUrl,
			license,
			wcposVersion,
			wcposProVersion,
			storeId,
			storeLocalID,
			storeLocale,
		});

		return {
			subscriberId,
			// Use locale from useLocale (e.g., 'en_US' - Novu's expected format)
			subscriberMetadata: { ...subscriberMetadata, locale },
			config: NOVU_CONFIG,
			isConfigured: true,
		};
	}, [
		site,
		store,
		wpCredentials,
		locale,
		siteUrl,
		license,
		wcposVersion,
		wcposProVersion,
		storeId,
		storeLocalID,
		storeLocale,
	]);

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
