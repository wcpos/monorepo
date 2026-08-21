import * as React from 'react';
import { Platform, View } from 'react-native';

import { Stack } from 'expo-router';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { useStoreSession } from '@wcpos/core/contexts/app-state';
import { useT } from '@wcpos/core/contexts/translations';
import { registerEngineScopeSwitcher } from '@wcpos/core/contexts/app-state/engine-scope-port';
import { useAppInfo } from '@wcpos/core/hooks/use-app-info';
import { useLocale } from '@wcpos/core/hooks/use-locale';
import { useSiteInfo } from '@wcpos/core/hooks/use-site-info';
import { useUserValidation } from '@wcpos/core/hooks/use-user-validation';
import { OnlineStatusLogger } from '@wcpos/core/screens/main/components/online-status/online-status-logger';
import { UnsentChangesBridge } from '@wcpos/core/screens/main/components/unsent-changes-bridge';
import { ReceiptEmailQueueBridge } from '@wcpos/core/screens/main/receipt/email-queue/bridge';
import { ExtraDataProvider } from '@wcpos/core/screens/main/contexts/extra-data';
import { UISettingsProvider } from '@wcpos/core/screens/main/contexts/ui-settings';
import { ScanHubProvider } from '@wcpos/core/screens/main/hooks/barcodes/scan-hub-context';
import { UpgradeRequired } from '@wcpos/core/screens/main/upgrade-required';
import { useCollection } from '@wcpos/core/screens/main/hooks/use-collection';
import { createRefreshHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client/refresh-http-client';
import { refreshAccessToken } from '@wcpos/hooks/use-http-client/refresh-access-token';
import { OnlineStatusProvider, useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { RasterizeProvider } from '@wcpos/printer';
import { QueryProvider, useDocField } from '@wcpos/query';
import { bareAuthParamSupported } from '@wcpos/utils/auth-param';
import { getLogger, setDatabase } from '@wcpos/utils/logger';
import { markUserActivity } from '@wcpos/utils/user-activity';

import { SyncConfigBridge } from '../../components/sync-config-bridge';
import { useNavigationBackground } from '../../components/use-navigation-background';
import { setAppOnlineStatus } from '../../lib/connectivity';
import { createAppSyncEngine, switchAppEngineScope } from '../../lib/create-app-engine';
import {
	getMetricsBuckets,
	hydrateMetricsBuckets,
	type MetricsBucket,
	resetMetricsBuckets,
} from '../../lib/metrics';
import { SyncStatusPersistenceBridge } from '../../lib/sync-status-persistence-bridge';

const METRICS_PERSIST_INTERVAL_MS = 5 * 60 * 1000;
const metricsLogger = getLogger(['wcpos', 'sync', 'host-metrics']);
const captureUserActivity = (): false => {
	markUserActivity();
	return false;
};

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(drawer)',
};

function AppStack() {
	const screenBackgroundColor = useNavigationBackground();
	const { storeDB, site, wpCredentials, store } = useStoreSession();
	const { locale } = useLocale();
	const t = useT();

	React.useEffect(() => {
		// React Native Web does not route every keyboard/pointer interaction through responders.
		if (Platform.OS !== 'web') return;
		const markActivity = () => markUserActivity();
		const events = ['keydown', 'pointerdown'] as const;
		events.forEach((event) => window.addEventListener(event, markActivity));
		return () => {
			events.forEach((event) => window.removeEventListener(event, markActivity));
		};
	}, []);

	/**
	 * The sync engine every fluent read is served from (ADR 0023 increment 1b).
	 * Bound to the site; store/cashier are scopes within it. Memoized on the
	 * site + scope identity — store switching via `scope.switch()` is a
	 * follow-up (increment-3).
	 */
	const wpApiUrl = useDocField(site, (value) => value.wp_api_url) as string;
	const wcposApiUrl = useDocField(site, (value) => value.wcpos_api_url) as string;
	const storeID = useDocField(store, (value) => value.id) as number;
	const cashierID = useDocField(wpCredentials, (value) => value.id) as number;
	const useJwtAsParam = useDocField(site, (value) => value.use_jwt_as_param) as boolean;
	const wcposVersion = useDocField(site, (value) => value.wcpos_version) as string;
	const bareAuthParam = bareAuthParamSupported(wcposVersion);

	// The credentials DOCUMENT is a stable identity; the engine reads the JWT
	// fresh at request time via getLatest() inside the lib module, so token
	// refreshes never recreate the engine and no ref is touched in render.
	// Construction is idempotent per scope (createAppSyncEngine caches by scope at
	// module level), so even if this memo re-runs — or the whole subtree remounts —
	// the same live engine is returned and its RxDatabase is never opened twice.
	// The store-switch flow awaits the engine's scope transition through this
	// port BEFORE committing the session (see switchAppEngineScope). Registered
	// here because AppStack owns the engine's lifecycle.
	React.useEffect(() => {
		registerEngineScopeSwitcher(switchAppEngineScope);
		return () => registerEngineScopeSwitcher(null);
	}, []);

	const engine = React.useMemo(
		() =>
			createAppSyncEngine({
				wpApiUrl,
				credentials: wpCredentials,
				useJwtAsParam,
				bareAuthParam,
				refreshAuth: (context) =>
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
						sessionRenewedMessage: t('auth.session_renewed_automatically'),
						operationId: context?.operationId,
					}),
				scope: { site: wpApiUrl, storeId: storeID, cashierId: cashierID },
			}),
		[wpApiUrl, wcposApiUrl, storeID, cashierID, useJwtAsParam, bareAuthParam, wpCredentials, t]
	);

	return (
		<QueryProvider localDB={storeDB} engine={engine} locale={locale}>
			<ExtraDataProvider>
				<SyncConfigBridge />
				{/* Keeps the "changes that never reached your server" count current for
				    the root error boundary, which renders above every provider and so
				    cannot ask the engine itself (#1098). */}
				<UnsentChangesBridge />
				{/* Receipt emails queued while offline drain from here (#165) — above the
			    screens, because the promise made at the Send button has to be kept
			    whether or not the receipt modal is still open. */}
				<ReceiptEmailQueueBridge />
				<UISettingsProvider>
					<CompatGate>
						<ScanHubProvider>
							<View
								className="bg-background flex-1"
								onStartShouldSetResponderCapture={captureUserActivity}
							>
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
						</ScanHubProvider>
					</CompatGate>
				</UISettingsProvider>
			</ExtraDataProvider>
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
	const { storeDB } = useStoreSession();

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
	const { site, wpCredentials } = useStoreSession();
	const wpAPIURL = useDocField(site, (value) => value.wp_api_url) as string;
	const { collection: logCollection } = useCollection('logs');
	useUserValidation({ site, wpUser: wpCredentials });

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
			<OnlineStatusLogger />
			<EngineConnectivityBridge />
			<MetricsPersistenceBridge />
			<SyncStatusPersistenceBridge />
			<RasterizeProvider>
				<AppStack />
			</RasterizeProvider>
		</OnlineStatusProvider>
	);
}
