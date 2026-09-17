import * as React from 'react';

import type {
	SiteDocument,
	StoreDatabase,
	StoreDocument,
	UserDatabase,
	UserDocument,
	WPCredentialsDocument,
} from '@wcpos/database';
import { getErrorMessage, getLogger, setDatabase } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { Platform } from '@wcpos/utils/platform';

import { useHydrationSuspense } from './use-hydration-suspense';
import { getEngineScopeSwitcher } from './engine-scope-port';
import { hydrateUserSession, switchUserSessionStore } from './hydration-steps';
import {
	commitStoreSession,
	IncompleteStoreSessionError,
	missingStoreSessionFields,
	SIGNED_OUT_SESSION,
} from './store-session';

import type {
	CurrentSessionIDs,
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
 * the `(app)` stack is mounted behind `Stack.Protected guard={hasStoreSession(state)}`.
 */
export interface StoreSessionState extends AppState {
	site: SiteDocument;
	wpCredentials: WPCredentialsDocument;
	store: StoreDocument;
	storeDB: StoreDatabase;
	extraData: ExtraDataState;
}

export {
	assertStoreSession,
	hasStoreSession,
	missingStoreSessionFields,
	STORE_SESSION_FIELDS,
	type StoreSessionField,
} from './store-session';

const sessionLogger = getLogger(['wcpos', 'app-state', 'session']);

/**
 * The one place an incomplete store session is reported: AUTH131 with the
 * merchant toast and the missing fields. Shared by the three producers — a
 * fresh login, a store switch, and the hydration-time recovery effect — so the
 * merchant hears the same named message however the session broke, instead of a
 * caller's generic code with no toast (#2112 review).
 */
function reportIncompleteSession(
	missingFields: readonly string[],
	ids: { siteID?: string; wpCredentialsID?: string; storeID?: string }
): void {
	sessionLogger.error(`Store session incomplete: missing ${missingFields.join(', ')}`, {
		code: ERROR_CODES.STORE_SESSION_INCOMPLETE,
		showToast: true,
		context: {
			missingFields,
			siteID: ids.siteID,
			wpCredentialsID: ids.wpCredentialsID,
			storeID: ids.storeID,
		},
	});
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
			// Hydrate first and refuse an incomplete session BEFORE the pointer is
			// persisted: a pointer to rows that are not there would only replay the
			// #2112 recovery on the next launch. Report AUTH131 (with the toast) and
			// stay on the picker rather than throwing into wp-users' generic catch,
			// which would surface AUTH999 with no feedback.
			const sessionData = await hydrateUserSession(state.userDB!, {
				siteID,
				wpCredentialsID,
				storeID,
			});
			try {
				updateAppState(
					await commitStoreSession(state.appState!, {
						ids: { siteID, wpCredentialsID, storeID },
						session: sessionData,
					})
				);
			} catch (error) {
				if (error instanceof IncompleteStoreSessionError) {
					reportIncompleteSession(error.missingFields, { siteID, wpCredentialsID, storeID });
					return;
				}
				throw error;
			}
		},
		[state.appState, state.userDB, updateAppState]
	);

	/**
	 * What logout does once it has decided to: forget the persisted pointer,
	 * then sign the React state out. Shared with the incomplete-session
	 * recovery below, so anything added to signing out reaches both.
	 */
	const clearStoreSession = React.useCallback(async () => {
		updateAppState(await commitStoreSession(state.appState!, null));
	}, [state.appState, updateAppState]);

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

		await clearStoreSession();
	}, [clearStoreSession]);

	const switchStore = React.useCallback(
		async (store: StoreDocument): Promise<void> => {
			const current = await state.appState!.get('current');
			if (store.localID === current?.storeID) {
				return;
			}

			let sessionData;
			try {
				sessionData = await switchUserSessionStore(state.userDB!, state.appState!, store.localID!, {
					switchEngineScope: getEngineScopeSwitcher() ?? undefined,
				});
			} catch (error) {
				if (error instanceof IncompleteStoreSessionError) {
					// The target store's rows are not all present. The aborted switch
					// left the engine and pointer untouched, so the current session is
					// intact; tell the cashier through AUTH131 rather than failing
					// silently (or as a caller's generic code).
					reportIncompleteSession(error.missingFields, {
						siteID: current?.siteID,
						wpCredentialsID: current?.wpCredentialsID,
						storeID: store.localID ?? undefined,
					});
					return;
				}
				throw error;
			}
			updateAppState(sessionData);
		},
		[state.appState, state.userDB, updateAppState]
	);

	/**
	 * A persisted session pointer the hydrated state cannot honour — the site,
	 * credential or store rows it names are gone — is not a session the till can
	 * run: the `(app)` stack would throw on its first render and strand the
	 * cashier on a red banner over a blank window (#2112 — the rows went missing
	 * when the user database's storage failed, wcpos/electron#459). Report which
	 * fields were missing, then do what logout does: clear the pointer so the
	 * next launch starts at the store list instead of replaying the failure, and
	 * sign the React state out so the auth stack shows now. The store's own
	 * database and its sales are untouched. Keyed on the POINTER, not on
	 * `storeDB`: a lost store row leaves no database at all and must still be
	 * reported and cleared. A signed-out till has no pointer and is left alone.
	 */
	const missingSessionFields = missingStoreSessionFields(state).join(',');
	// The (app) stack, which binds the logger's collection, never mounts for an
	// incomplete session, so without this the row would reach only the console.
	// When the store database survived (a lost site or credential row), its logs
	// collection keeps the evidence for the Logs screen and debug export; the
	// next AppLayout mount rebinds to whichever store the cashier opens.
	const survivingLogs = state.storeDB?.collections.logs;
	// The pointer already recovered from: the effect re-runs when the sign-out
	// it triggers lands, and must not report the same pointer twice.
	const recoveredPointer = React.useRef<string | null>(null);
	/* eslint-disable react-you-might-not-need-an-effect/no-event-handler -- the session arrives through render (Suspense hydration, or setState from login/switchStore); there is no handler to move this into, and the toast needs the mounted tree. */
	React.useEffect(() => {
		if (!missingSessionFields) return;
		// RxState reads are synchronous (`set` is the async one).
		let current: CurrentSessionIDs | null | undefined;
		try {
			current = state.appState?.get('current');
		} catch {
			current = undefined;
		}
		if (!current?.siteID && !current?.wpCredentialsID && !current?.storeID) return;
		const pointerKey = [current.siteID, current.wpCredentialsID, current.storeID].join('|');
		if (recoveredPointer.current === pointerKey) return;
		recoveredPointer.current = pointerKey;
		const missingFields = missingSessionFields.split(',');
		if (survivingLogs) setDatabase(survivingLogs);
		reportIncompleteSession(missingFields, current);
		void clearStoreSession().catch((error: unknown) => {
			// The same failing storage that lost the rows may refuse this write too;
			// the till is still signed out, it just replays the report next launch.
			sessionLogger.warn('Could not clear the incomplete session pointer', {
				context: { error: getErrorMessage(error) },
			});
			updateAppState(SIGNED_OUT_SESSION);
		});
	}, [missingSessionFields, survivingLogs, state.appState, clearStoreSession, updateAppState]);
	/* eslint-enable react-you-might-not-need-an-effect/no-event-handler */

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
 * `(app)` stack, which only mounts behind
 * `Stack.Protected guard={hasStoreSession(state)}` — a missing field here is
 * session-state corruption, and throwing a named error beats the
 * undefined-property crash it would otherwise become. Sessionless surfaces
 * (auth screens, connect flow) must stay on `useAppState`.
 */
export const useStoreSession = (): StoreSessionState => {
	const context = useAppState();
	const missing = missingStoreSessionFields(context);
	if (missing.length > 0) {
		throw new Error(
			`useStoreSession must be called within an active store session (missing: ${missing.join(', ')})`
		);
	}

	return context as StoreSessionState;
};
