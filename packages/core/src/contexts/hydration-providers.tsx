import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { FallbackScreen } from '@wcpos/components/error-boundary/fallback-screen';
import { Suspense } from '@wcpos/components/suspense';
import { DialogLabelsProvider } from '@wcpos/components/dialog';
import { PropertyRowLabelsProvider } from '@wcpos/components/property-row';

import { Splash, SplashProgressProvider } from '../screens/splash';
import { AppStateProvider } from './app-state';
import { NovuProvider } from './novu';
import { ThemeProvider } from './theme';
import { TranslationProvider, useT } from './translations';

interface HydrationProvidersProps {
	children: React.ReactNode;
}

function TranslatedDialogLabels({ children }: HydrationProvidersProps) {
	const t = useT();
	// One object per locale, so every dialog does not re-render when the root does.
	const labels = React.useMemo(
		() => ({ close: t('common.close'), cancel: t('common.cancel') }),
		[t]
	);
	const rowLabels = React.useMemo(
		() => ({ saved: t('settings.saved'), open: t('common.open') }),
		[t]
	);
	return (
		<DialogLabelsProvider labels={labels}>
			<PropertyRowLabelsProvider labels={rowLabels}>{children}</PropertyRowLabelsProvider>
		</DialogLabelsProvider>
	);
}

/**
 * Provider sandwich to ensure all providers are hydrated before rendering the app
 */
export function HydrationProviders({ children }: HydrationProvidersProps) {
	return (
		<SplashProgressProvider initialProgress={0}>
			<Suspense
				/**
				 * Single suspense boundary that handles all hydration steps:
				 * 1. App state hydration (step by step with progress updates)
				 * 2. Theme provider
				 * 3. Translation provider
				 * 4. Novu provider (for notifications)
				 * Each step throws suspense, updates progress, then continues
				 */
				fallback={<Splash />}
			>
				<AppStateProvider>
					{/* Around the whole app: a throw here replaces it, so the fallback is the gate. */}
					<ErrorBoundary FallbackComponent={FallbackScreen}>
						<ThemeProvider>
							<TranslationProvider>
								<TranslatedDialogLabels>
									<NovuProvider>{children}</NovuProvider>
								</TranslatedDialogLabels>
							</TranslationProvider>
						</ThemeProvider>
					</ErrorBoundary>
				</AppStateProvider>
			</Suspense>
		</SplashProgressProvider>
	);
}
