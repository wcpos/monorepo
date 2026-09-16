/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { getLogger, setDatabase } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

// Mutable so each test installs the session the provider hydrates into.
const mockHydration: { context: Record<string, unknown> } = { context: {} };

jest.mock('./use-hydration-suspense', () => ({
	useHydrationSuspense: () => ({
		isComplete: true,
		context: mockHydration.context,
		progress: 100,
		currentMessage: 'Ready!',
		currentStep: 'COMPLETE',
		error: null,
	}),
}));

jest.mock('./hydration-steps', () => ({
	hydrateUserSession: jest.fn(),
	switchUserSessionStore: jest.fn(),
}));

jest.mock('@wcpos/utils/platform', () => ({
	Platform: { isWeb: false },
}));

// eslint-disable-next-line import/first -- Jest mocks must be registered before importing the module under test.
import { hydrateUserSession, switchUserSessionStore } from './hydration-steps';
// The real store-session module (not mocked): IncompleteStoreSessionError is what the producers discriminate on.
// eslint-disable-next-line import/first
import { IncompleteStoreSessionError } from './store-session';
// eslint-disable-next-line import/first -- Jest mocks must be registered before importing the module under test.
import {
	type AppState,
	AppStateContext,
	AppStateProvider,
	hasStoreSession,
	missingStoreSessionFields,
	useAppState,
	useStoreSession,
} from './index';

const logger = getLogger(['wcpos', 'app-state', 'session']);

const site = { localID: 'site-1' };
const wpCredentials = { localID: 'creds-1' };
const store = { localID: 'store-1' };
const storeDB = { name: 'store-db', collections: { logs: { name: 'logs' } } };
const extraData = { get: jest.fn() };
const pointer = { siteID: 'site-1', wpCredentialsID: 'creds-1', storeID: 'store-1' };

/** The always-present half of the hydrated context, with the persisted `current` pointer. */
function sessionBase(current: typeof pointer | null = pointer) {
	return {
		userDB: {},
		appState: {
			// RxState.get is synchronous; an async mock here hid a `.catch()` on a
			// plain object that threw before the report (Codex review). It keeps
			// returning the pointer after `set`, which is what a slow store looks
			// like to the re-run effect — the recovery must not report it twice.
			get: jest.fn(() => current),
			set: jest.fn(async () => undefined),
		},
		translationsState: {},
		user: { localID: 'user-1' },
	};
}

function Probe() {
	const state = useAppState();
	return (
		<div data-testid="probe">
			{hasStoreSession(state) ? 'session' : 'no-session'}:{state.storeDB ? 'db' : 'no-db'}
		</div>
	);
}

function renderProvider(context: Record<string, unknown>) {
	mockHydration.context = context;
	render(
		<AppStateProvider>
			<Probe />
		</AppStateProvider>
	);
}

let consoleError: jest.SpyInstance;

beforeEach(() => {
	jest.clearAllMocks();
	mockHydration.context = {};
	consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	consoleError.mockRestore();
});

describe('missingStoreSessionFields', () => {
	it('names every absent or null field of the five an active session needs', () => {
		expect(missingStoreSessionFields({})).toEqual([
			'storeDB',
			'store',
			'site',
			'wpCredentials',
			'extraData',
		]);
		expect(
			missingStoreSessionFields({ storeDB, store, site: null, wpCredentials: null, extraData })
		).toEqual(['site', 'wpCredentials']);
		expect(missingStoreSessionFields({ storeDB, store, site, wpCredentials, extraData })).toEqual(
			[]
		);
	});

	it('is the predicate hasStoreSession answers', () => {
		expect(hasStoreSession({ storeDB, store, site, wpCredentials, extraData })).toBe(true);
		expect(hasStoreSession({ storeDB, store, site, wpCredentials: null, extraData })).toBe(false);
		expect(hasStoreSession({})).toBe(false);
	});
});

describe('useStoreSession', () => {
	it('names the missing fields when the session is incomplete', () => {
		const value = { ...sessionBase(), storeDB, store, extraData } as unknown as AppState;
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
		);

		expect(() => renderHook(() => useStoreSession(), { wrapper })).toThrow(
			'useStoreSession must be called within an active store session (missing: site, wpCredentials)'
		);
	});

	it('returns the narrowed state when every field is present', () => {
		const value = {
			...sessionBase(),
			storeDB,
			store,
			site,
			wpCredentials,
			extraData,
		} as unknown as AppState;
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
		);

		const { result } = renderHook(() => useStoreSession(), { wrapper });
		expect(result.current.site).toBe(site);
	});
});

describe('login', () => {
	it('reports AUTH131 and does not persist a pointer to an incomplete session', async () => {
		const base = sessionBase(null);
		mockHydration.context = { ...base };
		(hydrateUserSession as jest.Mock).mockResolvedValueOnce({
			storeDB,
			store,
			extraData,
			site: null,
			wpCredentials: null,
		});
		const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

		// Resolves rather than throwing into wp-users' generic catch (which would
		// surface AUTH999 with no toast); the cashier gets the named AUTH131.
		await act(async () => {
			await result.current.login({
				siteID: 'site-1',
				wpCredentialsID: 'creds-1',
				storeID: 'store-1',
			});
		});

		expect(logger.error).toHaveBeenCalledTimes(1);
		const [message, options] = (logger.error as jest.Mock).mock.calls[0];
		expect(message).toBe('Store session incomplete: missing site, wpCredentials');
		expect(options).toEqual(
			expect.objectContaining({
				code: ERROR_CODES.STORE_SESSION_INCOMPLETE,
				showToast: true,
				context: expect.objectContaining({
					missingFields: ['site', 'wpCredentials'],
					siteID: 'site-1',
					wpCredentialsID: 'creds-1',
					storeID: 'store-1',
				}),
			})
		);
		expect(base.appState.set).not.toHaveBeenCalled();
		expect(hasStoreSession(result.current)).toBe(false);
	});

	it('persists the pointer once the hydrated session is complete', async () => {
		const base = sessionBase(null);
		mockHydration.context = { ...base };
		(hydrateUserSession as jest.Mock).mockResolvedValueOnce({
			storeDB,
			store,
			extraData,
			site,
			wpCredentials,
		});
		const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

		await act(async () => {
			await result.current.login({
				siteID: 'site-1',
				wpCredentialsID: 'creds-1',
				storeID: 'store-1',
			});
		});

		expect(base.appState.set).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(hasStoreSession(result.current)).toBe(true));
	});
});

describe('switchStore', () => {
	it('reports AUTH131 and keeps the current session when the target store is incomplete', async () => {
		const base = sessionBase();
		mockHydration.context = { ...base, storeDB, store, site, wpCredentials, extraData };
		(switchUserSessionStore as jest.Mock).mockRejectedValueOnce(
			new IncompleteStoreSessionError(['site'])
		);
		const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });
		await waitFor(() => expect(hasStoreSession(result.current)).toBe(true));
		jest.clearAllMocks();

		// A different store id than `current`, so the switch actually runs.
		await act(async () => {
			await result.current.switchStore({ localID: 'store-9' } as never);
		});

		expect(logger.error).toHaveBeenCalledTimes(1);
		const [message, options] = (logger.error as jest.Mock).mock.calls[0];
		expect(message).toBe('Store session incomplete: missing site');
		expect(options.code).toBe(ERROR_CODES.STORE_SESSION_INCOMPLETE);
		expect(options.showToast).toBe(true);
		expect(options.context.storeID).toBe('store-9');
		// The current session is untouched.
		expect(hasStoreSession(result.current)).toBe(true);
	});
});

describe('AppStateProvider with a session pointer the hydrated state cannot honour', () => {
	it('reports which fields were missing, clears the pointer and signs the till out', async () => {
		const base = sessionBase();
		renderProvider({ ...base, storeDB, store, extraData, site: null });

		await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('no-session:no-db'));

		expect(logger.error).toHaveBeenCalledTimes(1);
		const [message, options] = (logger.error as jest.Mock).mock.calls[0];
		expect(message).toBe('Store session incomplete: missing site, wpCredentials');
		expect(options).toEqual(
			expect.objectContaining({
				code: ERROR_CODES.STORE_SESSION_INCOMPLETE,
				showToast: true,
				context: expect.objectContaining({
					missingFields: ['site', 'wpCredentials'],
					siteID: 'site-1',
					wpCredentialsID: 'creds-1',
					storeID: 'store-1',
				}),
			})
		);

		// The surviving store database keeps the row for the Logs screen: nothing
		// else binds the logger's collection when the (app) stack never mounts.
		expect(setDatabase).toHaveBeenCalledWith(storeDB.collections.logs);
		expect((setDatabase as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
			(logger.error as jest.Mock).mock.invocationCallOrder[0]
		);

		// The persisted pointer is cleared the way logout clears it, so the next
		// launch starts at the store list instead of replaying the broken session.
		expect(base.appState.set).toHaveBeenCalledTimes(1);
		const [key, update] = base.appState.set.mock.calls[0] as unknown as [string, () => unknown];
		expect(key).toBe('current');
		expect(update()).toBeNull();
	});

	it('catches a lost STORE row, which leaves no store database to key on', async () => {
		const base = sessionBase();
		renderProvider({ ...base, site, wpCredentials, store: null });

		await waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
		const [message, options] = (logger.error as jest.Mock).mock.calls[0];
		expect(message).toBe('Store session incomplete: missing storeDB, store, extraData');
		expect(options.context.missingFields).toEqual(['storeDB', 'store', 'extraData']);
		expect(base.appState.set).toHaveBeenCalledTimes(1);
		// No store database survived, so there is nothing to bind.
		expect(setDatabase).not.toHaveBeenCalled();
	});

	it('still signs the till out when the pointer write fails', async () => {
		const base = sessionBase();
		base.appState.set.mockRejectedValueOnce(new Error('storage gone'));
		renderProvider({ ...base, storeDB, store, extraData, site: null });

		await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('no-session:no-db'));
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.warn).toHaveBeenCalledWith('Could not clear the incomplete session pointer', {
			context: { error: 'storage gone' },
		});
	});

	it('leaves a complete session alone', async () => {
		const base = sessionBase();
		renderProvider({ ...base, storeDB, store, site, wpCredentials, extraData });

		await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('session:db'));
		expect(logger.error).not.toHaveBeenCalled();
		expect(base.appState.set).not.toHaveBeenCalled();
	});

	it('treats a till with no pointer as signed out, not as incomplete', async () => {
		const base = sessionBase(null);
		renderProvider({ ...base });

		await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('no-session:no-db'));
		expect(logger.error).not.toHaveBeenCalled();
		expect(base.appState.set).not.toHaveBeenCalled();
	});
});
