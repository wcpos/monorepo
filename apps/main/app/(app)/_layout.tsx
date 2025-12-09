import { Stack } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';
import { useCSSVariable } from 'uniwind';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { useAppState } from '@wcpos/core/contexts/app-state';
import { useLocale } from '@wcpos/core/hooks/use-locale';
import { ExtraDataProvider } from '@wcpos/core/screens/main/contexts/extra-data';
import { UISettingsProvider } from '@wcpos/core/screens/main/contexts/ui-settings';
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
	const backgroundColor = useCSSVariable('--color-background');

	/**
	 * The http client now has access to online status context
	 */
	const http = useRestHttpClient();

	return (
		<QueryProvider localDB={storeDB} fastLocalDB={fastStoreDB} http={http} locale={locale}>
			<UISettingsProvider>
				<Stack
					screenOptions={{
						headerShown: false,
						contentStyle: { backgroundColor },
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
					<Stack.Screen
						name="(modals)/login"
						options={{
							presentation: 'containedTransparentModal',
							animation: 'fade',
							contentStyle: { backgroundColor: 'transparent' },
						}}
					/>
				</Stack>
				{/**
				 * We need to have a PortalHost inside the UISettingsProvider
				 */}
				<ErrorBoundary>
					<PortalHost />
				</ErrorBoundary>
			</UISettingsProvider>
		</QueryProvider>
	);
}

export default function AppLayout() {
	const { site } = useAppState();
	const wpAPIURL = useObservableEagerState(site.wp_api_url$) as string;
	const { collection: logCollection } = useCollection('logs');
	setDatabase(logCollection);

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
