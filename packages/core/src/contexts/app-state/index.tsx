import * as React from 'react';

import type {
	SiteDocument,
	StoreDatabase,
	StoreDocument,
	UserDatabase,
	UserDocument,
	WPCredentialsDocument,
} from '@wcpos/database';
import { Platform } from '@wcpos/utils/platform';

import { useHydrationSuspense } from './use-hydration-suspense';
import { getEngineScopeSwitcher } from './engine-scope-port';
import { hydrateUserSession, switchUserSessionStore } from './hydration-steps';

import type {
	ExtraDataState,
	HydrationContext,
	SessionAppState,
	TranslationsState,
} from './hydration-steps';

/** The context value: the hydrated session plus the session actions. */
export interface AppState extends HydrationContext {
	/** Always present after hydration — the first hydration step throws without them. */
	userDB: UserDatabase;
	appState: SessionAppState;
	translationsState: TranslationsState;
	user: UserDocument;
	updateAppState: (updates: Partial<HydrationContext>) => void;
	login: (args: { siteID: string; wpCredentialsID: string; storeID: string }) => Promise<void>;
	logout: () => Promise<void>;
	switchStore: (store: StoreDocument) => Promise<void>;
}

/**
 * AppState narrowed to an active store session — everything the logged-in area
 * may assume present. Login and store-switch write these fields together, and
 * the `(app)` stack is mounted behind `Stack.Protected guard={!!storeDB}`.
 */
export interface StoreSessionState extends AppState {
	site: SiteDocument;
	wpCredentials: WPCredentialsDocument;
	store: StoreDocument;
	storeDB: StoreDatabase;
	extraData: ExtraDataState;
}

export const AppStateContext = React.createContext<AppState | undefined>(undefined);

/**
 * Navigate to URL - extracted to avoid React Compiler warning about
 * writing to variables outside the component
 */
function navigateToUrl(url: string): void {
	window.location.href = url;
}

/**
 *
 */
export function AppStateProvider({ children }: { children: React.ReactNode }) {
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
			await state.appState!.set('current', () => ({
				siteID,
				wpCredentialsID,
				storeID,
			}));

			// Hydrate session data from database
			const sessionData = await hydrateUserSession(state.userDB!, {
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
		if (Platform.isWeb) {
			// Get logout URL from global initialProps if available
			const initialProps = (globalThis as any).initialProps;
			if (initialProps?.logout_url) {
				// WordPress embedded mode - redirect to WordPress logout URL
				navigateToUrl(initialProps.logout_url);
				return;
			}
			// Standalone web mode - clear session like native does (don't just reload)
			// Fall through to native logout logic below
		}

		// Clear session state in database
		await state.appState!.set('current', () => null);

		// Clear React state
		updateAppState({
			site: undefined,
			wpCredentials: undefined,
			store: undefined,
			storeDB: undefined,
			extraData: undefined,
		});
	}, [state.appState, updateAppState]);

	const switchStore = React.useCallback(
		async (store: StoreDocument): Promise<void> => {
			const current = await state.appState!.get('current');
			if (store.localID === current?.storeID) {
				return;
			}

			const sessionData = await switchUserSessionStore(
				state.userDB!,
				state.appState!,
				store.localID!,
				{ switchEngineScope: getEngineScopeSwitcher() ?? undefined }
			);
			updateAppState(sessionData);
		},
		[state.appState, state.userDB, updateAppState]
	);

	const value = React.useMemo<AppState>(() => {
		return {
			...state,
			// Present after hydration by construction — the first step throws without them.
			userDB: state.userDB!,
			appState: state.appState!,
			translationsState: state.translationsState!,
			user: state.user!,
			updateAppState,
			login,
			logout,
			switchStore,
		};
	}, [state, updateAppState, login, logout, switchStore]);

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export const useAppState = (): AppState => {
	const context = React.useContext(AppStateContext);
	if (!context) {
		throw new Error(`useAppState must be called within AppStateContext`);
	}

	return context;
};

/**
 * `useAppState` asserted to an active store session. For consumers inside the
 * `(app)` stack, which only mounts behind `Stack.Protected guard={!!storeDB}` —
 * a missing field here is session-state corruption, and throwing a named error
 * beats the undefined-property crash it would otherwise become. Sessionless
 * surfaces (auth screens, connect flow) must stay on `useAppState`.
 */
export const useStoreSession = (): StoreSessionState => {
	const context = useAppState();
	if (
		!context.storeDB ||
		!context.store ||
		!context.site ||
		!context.wpCredentials ||
		!context.extraData
	) {
		throw new Error(`useStoreSession must be called within an active store session`);
	}

	return context as StoreSessionState;
};
