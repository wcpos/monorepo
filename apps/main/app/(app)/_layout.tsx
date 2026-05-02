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
import { UpgradeRequired } from '@wcpos/core/screens/main/upgrade-required';
import { useCollection } from '@wcpos/core/screens/main/hooks/use-collection';
import { useRestHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client';
import { OnlineStatusProvider } from '@wcpos/hooks/use-online-status';
import { QueryProvider } from '@wcpos/query';
import { setDatabase } from '@wcpos/utils/logger';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(drawer)',
};

function AppStack() {
	const { storeDB, fastStoreDB } = useAppState();
	const { locale } = useLocale();

	/**
	 * The http client now has access to online status context
	 */
	const http = useRestHttpClient();

	return (
		<QueryProvider localDB={storeDB} fastLocalDB={fastStoreDB} http={http} locale={locale}>
			<UISettingsProvider>
				<View className="bg-background flex-1">
					<Stack
						screenOptions={{
							headerShown: false,
							contentStyle: { backgroundColor: 'transparent' },
						}}
					>
						<Stack.Screen name="(drawer)" />
						<Stack.Screen
							name="(modals)/settings"
							options={{
								presentation: 'containedTransparentModal',
								animation: 'fade',
								contentStyle: { backgroundColor: 'transparent' },
							}}
						/>
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
			</UISettingsProvider>
		</QueryProvider>
	);
}

export default function AppLayout() {
	const { site } = useAppState();
	const wpAPIURL = useObservableEagerState(site.wp_api_url$) as string;
	const { collection: logCollection } = useCollection('logs');
	setDatabase(logCollection);

	// Fetch fresh site data (versions, license) on mount
	useSiteInfo({ site });

	// Block UI if the PHP plugin is older than the app.
	// Only gate once wcposVersion is populated — before the fetch completes (or if it
	// fails, e.g. offline) we fail open so we don't block compatible users.
	const { compatibility, site: siteVersionInfo } = useAppInfo();
	if (siteVersionInfo?.wcposVersion && !compatibility?.wcposVersionPass) {
		return <UpgradeRequired />;
	}

	if (!wpAPIURL) {
		throw new Error('No WP API URL');
	}

	return (
		<OnlineStatusProvider wpAPIURL={wpAPIURL}>
			<ExtraDataProvider>
				<AppStack />
			</ExtraDataProvider>
		</OnlineStatusProvider>
	);
}
