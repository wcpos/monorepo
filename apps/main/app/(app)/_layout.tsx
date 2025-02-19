import { Redirect, Stack } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '@wcpos/core/contexts/app-state';
import { useLocale } from '@wcpos/core/hooks/use-locale';
import { ExtraDataProvider } from '@wcpos/core/screens/main/contexts/extra-data';
import { UISettingsProvider } from '@wcpos/core/screens/main/contexts/ui-settings';
import { Errors } from '@wcpos/core/screens/main/errors';
import { useRestHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client';
import { OnlineStatusProvider } from '@wcpos/hooks/use-online-status';
import { QueryProvider } from '@wcpos/query';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(drawer)',
};

const App = () => {
	const { site, storeDB, fastStoreDB } = useAppState();
	const wpAPIURL = useObservableEagerState(site.wp_api_url$);
	const { locale } = useLocale();

	/**
	 * The http client should be smarter, ie: if offline or no auth, it should pause the replications
	 * or put this as part of the OnlineStatusProvider
	 */
	const http = useRestHttpClient();

	if (!storeDB) {
		return <Redirect href="/(auth)/connect" />;
	}

	return (
		<ExtraDataProvider>
			<QueryProvider localDB={storeDB} fastLocalDB={fastStoreDB} http={http} locale={locale}>
				<UISettingsProvider>
					<OnlineStatusProvider wpAPIURL={wpAPIURL}>
						<Stack>
							<Stack.Screen
								name="(drawer)"
								options={{
									headerShown: false,
								}}
							/>
							<Stack.Screen
								name="(modal)/settings"
								options={{
									presentation: 'modal',
								}}
							/>
						</Stack>
					</OnlineStatusProvider>
				</UISettingsProvider>
				<Errors /> {/* TODO - we need a app-wide event bus to channel errors to the snackbar */}
			</QueryProvider>
		</ExtraDataProvider>
	);
};

const RedirectWrapper = ({ children }: { children: React.ReactNode }) => {
	const { storeDB } = useAppState();
	if (!storeDB) {
		// Redirect to the authentication route if storeDB is not set.
		return <Redirect href="/(auth)/connect" />;
	}
	return <>{children}</>;
};

export default function AppLayout() {
	return (
		<RedirectWrapper>
			<App />
		</RedirectWrapper>
	);
}
