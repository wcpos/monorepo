import * as React from 'react';
import { View } from 'react-native';

import { Stack } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { useAppState } from '@wcpos/core/contexts/app-state';
import { useAppInfo } from '@wcpos/core/hooks/use-app-info';
import { useLocale } from '@wcpos/core/hooks/use-locale';
import { useSiteInfo } from '@wcpos/core/hooks/use-site-info';
import { ExtraDataProvider } from '@wcpos/core/screens/main/contexts/extra-data';
import { UISettingsProvider } from '@wcpos/core/screens/main/contexts/ui-settings';
import { DeviceScanProvider } from '@wcpos/core/screens/main/hooks/barcodes/device-scan-context';
import { UpgradeRequired } from '@wcpos/core/screens/main/upgrade-required';
import { useCollection } from '@wcpos/core/screens/main/hooks/use-collection';
import { createRefreshHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client/refresh-http-client';
import { useRestHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client';
import type { StoreDatabase } from '@wcpos/database';
import { refreshAccessToken } from '@wcpos/hooks/use-http-client/refresh-access-token';
import { OnlineStatusProvider, useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { RasterizeProvider } from '@wcpos/printer';
import { QueryProvider } from '@wcpos/query';
import { getLogger, setDatabase } from '@wcpos/utils/logger';

import { SyncConfigBridge } from '../../components/sync-config-bridge';
import { useNavigationBackground } from '../../components/use-navigation-background';
import { setAppOnlineStatus } from '../../lib/connectivity';
import { createAppSyncEngine } from '../../lib/create-app-engine';
import {
	getMetricsBuckets,
	hydrateMetricsBuckets,
	type MetricsBucket,
	resetMetricsBuckets,
} from '../../lib/metrics';

const METRICS_PERSIST_INTERVAL_MS = 5 * 60 * 1000;
const metricsLogger = getLogger(['wcpos', 'sync', 'host-metrics']);

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(drawer)',
};

function AppStack() {
	const screenBackgroundColor = useNavigationBackground();
	const { storeDB, site, wpCredentials, store } = useAppState();
	const { locale } = useLocale();

	/**
	 * The http client now has access to online status context
	 */
	const http = useRestHttpClient();

	/**
	 * The sync engine every fluent read is served from (ADR 0023 increment 1b).
	 * Bound to the site; store/cashier are scopes within it. Memoized on the
	 * site + scope identity — store switching via `scope.switch()` is a
	 * follow-up (increment-3).
	 */
	const wpApiUrl = useObservableEagerState(site.wp_api_url$) as string;
	const wcposApiUrl = useObservableEagerState(site.wcpos_api_url$) as string;
	const storeID = useObservableEagerState(store.id$) as number;
	const cashierID = useObservableEagerState(wpCredentials.id$) as number;
	const useJwtAsParam = useObservableEagerState(site.use_jwt_as_param$) as boolean;

	// The credentials DOCUMENT is a stable identity; the engine reads the JWT
	// fresh at request time via getLatest() inside the lib module, so token
	// refreshes never recreate the engine and no ref is touched in render.
	// Construction is idempotent per scope (createAppSyncEngine caches by scope at
	// module level), so even if this memo re-runs — or the whole subtree remounts —
	// the same live engine is returned and its RxDatabase is never opened twice.
	const engine = React.useMemo(
		() =>
			createAppSyncEngine({
				wpApiUrl,
				credentials: wpCredentials,
				useJwtAsParam,
				refreshAuth: () =>
					refreshAccessToken({
						site: {
							wcpos_api_url: wcposApiUrl,
							// Fallback the shared core uses to construct `${wp_api_url}wcpos/v2/`
							// when wcpos_api_url is transiently unset (e.g. after a web wake).
							wp_api_url: wpApiUrl,
							use_jwt_as_param: useJwtAsParam,
						},
						wpUser: wpCredentials,
						getHttpClient: createRefreshHttpClient,
					}),
				scope: { site: wpApiUrl, storeId: storeID, cashierId: cashierID },
			}),
		[wpApiUrl, wcposApiUrl, storeID, cashierID, useJwtAsParam, wpCredentials]
	);

	return (
		<QueryProvider localDB={storeDB} engine={engine} http={http} locale={locale}>
			<SyncConfigBridge />
			<UISettingsProvider>
				<CompatGate>
					<DeviceScanProvider>
						<View className="bg-background flex-1">
							<Stack
								screenOptions={{
									headerShown: false,
									contentStyle: { backgroundColor: screenBackgroundColor },
								}}
							>
								<Stack.Screen name="(drawer)" />
								<Stack.Screen
									name="(modals)/tax-rates"
									options={{
										presentation: 'containedTransparentModal',
										animation: 'fade',
										contentStyle: { backgroundColor: 'transparent' },
									}}
								/>
								{/* <Stack.Screen
							name="(modals)/login"
							options={{
								presentation: 'containedTransparentModal',
								animation: 'fade',
								contentStyle: { backgroundColor: 'transparent' },
							}}
						/> */}
							</Stack>
							{/**
							 * We need to have a PortalHost inside the UISettingsProvider
							 */}
							<ErrorBoundary>
								<PortalHost />
							</ErrorBoundary>
						</View>
					</DeviceScanProvider>
				</CompatGate>
			</UISettingsProvider>
		</QueryProvider>
	);
}

/**
 * The plugin-version compatibility gate. It lives BELOW the engine + QueryProvider
 * (inside AppStack) so that toggling it — the `wcposVersion` (useSiteInfo) and
 * `wcposVersionPass` (useAppInfo) values settle on separate async timelines and
 * transiently disagree during boot — only swaps the gated CONTENT and never
 * unmounts the engine. Previously this gate early-returned in AppLayout, above
 * AppStack, so the toggle remounted AppStack and constructed the engine twice; the
 * second construction collided on the already-open RxDatabase (multiInstance:false)
 * and its scope never became ready, leaving every binding reading an empty engine.
 */
function CompatGate({ children }: { children: React.ReactNode }) {
	const { compatibility, site: siteVersionInfo } = useAppInfo();
	if (siteVersionInfo?.wcposVersion && !compatibility?.wcposVersionPass) {
		return <UpgradeRequired />;
	}
	return <>{children}</>;
}

function EngineConnectivityBridge() {
	const { status } = useOnlineStatus();

	// Keep the sync engine's non-React connectivity port aligned with the provider.
	React.useEffect(() => {
		setAppOnlineStatus(status);
	}, [status]);

	return null;
}

function MetricsPersistenceBridge() {
	const { storeDB } = useAppState() as { storeDB?: StoreDatabase };

	// Bridge the module-level metrics store to the active per-store RxDB lifecycle.
	React.useEffect(() => {
		if (!storeDB) return;

		// Tracks whether this store is still the active one. A store switch tears the
		// effect down (setting this) before the incoming store resets the module map;
		// a hydrate that resolves after that point belongs to the outgoing store and
		// must be dropped, or it would fold this store's counts into the new store.
		let cancelled = false;

		// Each store owns its host metrics. Drop any prior store's in-memory buckets
		// before hydrating this store so one store never displays or re-persists
		// another store's metrics. Safe against the outgoing store's final persist
		// below, which snapshots synchronously before this reset can run.
		resetMetricsBuckets();

		// Hydration is async, but the engine (constructed during AppStack render) can
		// fire startup ticks that open the current hour before this resolves. That is
		// safe: hydrateMetricsBuckets folds persisted counts into any already-open
		// bucket instead of skipping it, so no earlier-in-the-hour counts are lost.
		const statePromise = storeDB.addState<MetricsBucket[]>('host_metrics_v1');
		void statePromise
			.then((state) => {
				if (cancelled) return;
				hydrateMetricsBuckets(state.get());
			})
			.catch((error: unknown) => {
				metricsLogger.warn('Failed to hydrate host sync metrics', {
					context: { error: String(error) },
				});
			});

		const persist = async (buckets: MetricsBucket[]): Promise<void> => {
			try {
				const state = await statePromise;
				await state.set('', () => buckets);
			} catch (error) {
				metricsLogger.warn('Failed to persist host sync metrics', {
					context: { error: String(error) },
				});
			}
		};
		const interval = setInterval(
			() => void persist(getMetricsBuckets()),
			METRICS_PERSIST_INTERVAL_MS
		);

		return () => {
			cancelled = true;
			clearInterval(interval);
			// Snapshot this store's buckets synchronously so the next store's
			// resetMetricsBuckets() can't blank them before the write lands.
			void persist(getMetricsBuckets());
		};
	}, [storeDB]);

	return null;
}

export default function AppLayout() {
	const { site } = useAppState();
	const wpAPIURL = useObservableEagerState(site.wp_api_url$) as string;
	const { collection: logCollection } = useCollection('logs');

	// The logger holds its collection outside React, so release the outgoing store on unmount.
	React.useEffect(() => {
		setDatabase(logCollection);
		return () => setDatabase(null);
	}, [logCollection]);

	// Fetch fresh site data (versions, license) on mount
	useSiteInfo({ site });

	// The plugin-version compatibility gate moved INTO AppStack (CompatGate), below
	// the engine + QueryProvider, so its transient boot-time toggling no longer
	// remounts the engine-owning subtree. See CompatGate.

	if (!wpAPIURL) {
		throw new Error('No WP API URL');
	}

	return (
		<OnlineStatusProvider wpAPIURL={wpAPIURL}>
			<EngineConnectivityBridge />
			<MetricsPersistenceBridge />
			<ExtraDataProvider>
				<RasterizeProvider>
					<AppStack />
				</RasterizeProvider>
			</ExtraDataProvider>
		</OnlineStatusProvider>
	);
}
