import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import { AppStateProvider } from './app-state';
import { TranslationProvider } from './translations';
import { Splash } from '../screens/splash';
/**
 * Provider sandwich to ensure all providers are hydrated before rendering the app
 */
export const HydrationProviders = ({ children }) => {
	return (
		<Suspense
			/**
			 * First suspense to load the initial app state
			 * - we now have site, user, store, etc if the user is logged in
			 */
			fallback={<Splash progress={33} />}
		>
			<AppStateProvider>
				<ErrorBoundary>
					<Suspense
						/**
						 * Second suspense to allow anything else to load that depends on the app state
						 * - translations, theme, etc
						 */
						fallback={<Splash progress={66} />}
					>
						<TranslationProvider>
							<Suspense fallback={<Splash progress={100} />}>{children}</Suspense>
						</TranslationProvider>
					</Suspense>
				</ErrorBoundary>
			</AppStateProvider>
		</Suspense>
	);
};
