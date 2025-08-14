import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import { Splash, SplashProgressProvider } from '../screens/splash';
import { AppStateProvider } from './app-state';
import { ThemeProvider } from './theme';
import { TranslationProvider } from './translations';

interface HydrationProvidersProps {
	children: React.ReactNode;
}

/**
 * Provider sandwich to ensure all providers are hydrated before rendering the app
 */
export const HydrationProviders = ({ children }: HydrationProvidersProps) => {
	return (
		<SplashProgressProvider initialProgress={0}>
			<Suspense
				/**
				 * Single suspense boundary that handles all hydration steps:
				 * 1. App state hydration (step by step with progress updates)
				 * 2. Theme provider
				 * 3. Translation provider
				 * Each step throws suspense, updates progress, then continues
				 */
				fallback={<Splash />}
			>
				<AppStateProvider>
					<ErrorBoundary>
						<ThemeProvider>
							<TranslationProvider>{children}</TranslationProvider>
						</ThemeProvider>
					</ErrorBoundary>
				</AppStateProvider>
			</Suspense>
		</SplashProgressProvider>
	);
};
