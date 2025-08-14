import * as React from 'react';

import type { StoreDocument } from '@wcpos/database';
import Platform from '@wcpos/utils/platform';

import { useHydrationSuspense } from './use-hydration-suspense';
import { hydrateUserSession } from './hydration-steps';

import type { HydrationContext } from './hydration-steps';

export const AppStateContext = React.createContext<any | undefined>(undefined);

/**
 *
 */
export const AppStateProvider = ({ children }: { children: React.ReactNode }) => {
	const hydration = useHydrationSuspense();

	// Handle errors by throwing them - let error boundaries handle display
	if (hydration.error) {
		throw hydration.error;
	}

	const [state, setState] = React.useState(hydration.context);

	// Function to update app state (for runtime changes like login, logout, store switch)
	const updateAppState = React.useCallback((updates: Partial<HydrationContext>) => {
		setState((prev) => ({ ...prev, ...updates }));
	}, []);

	// App actions
	const login = React.useCallback(
		async ({
			siteID,
			wpCredentialsID,
			storeID,
		}: {
			siteID: string;
			wpCredentialsID: string;
			storeID: string;
		}) => {
			// Update database state
			await state.appState.set('current', () => ({
				siteID,
				wpCredentialsID,
				storeID,
			}));

			// Hydrate session data from database
			const sessionData = await hydrateUserSession(state.userDB, {
				siteID,
				wpCredentialsID,
				storeID,
			});

			// Update React state
			updateAppState(sessionData);
		},
		[state.appState, state.userDB, updateAppState]
	);

	const logout = React.useCallback(async () => {
		await state.appState.set('current', () => null);

		updateAppState({
			site: undefined,
			wpCredentials: undefined,
			store: undefined,
			storeDB: undefined,
			fastStoreDB: undefined,
			extraData: undefined,
		});

		if (Platform.isWeb && typeof window !== 'undefined') {
			// Get logout URL from global initialProps if available
			const initialProps = (globalThis as any).initialProps;
			if (initialProps?.logout_url) {
				window.location.href = initialProps.logout_url;
			} else {
				// Fallback to reloading the page
				window.location.reload();
			}
		}
	}, [state.appState, updateAppState]);

	const switchStore = React.useCallback(
		async (store: StoreDocument) => {
			const current = await state.appState.get('current');
			const newState = { ...current, storeID: store.localID };
			await state.appState.set('current', newState);

			const sessionData = await hydrateUserSession(state.userDB, newState);

			updateAppState(sessionData);
		},
		[state.appState, state.userDB, updateAppState]
	);

	const value = React.useMemo(() => {
		return {
			...state,
			updateAppState,
			login,
			logout,
			switchStore,
		};
	}, [state, updateAppState, login, logout, switchStore]);

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
	const context = React.useContext(AppStateContext);
	if (!context) {
		throw new Error(`useAppState must be called within AppStateContext`);
	}

	return context;
};
