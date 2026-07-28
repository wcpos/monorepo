import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SyncStatusPersistenceBridge } from '../app/(app)/_layout';
import {
	getSyncStatusState,
	hydrateSyncStatus,
	resetSyncStatus,
	type SyncStatusState,
} from './sync-status';

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

let mockStoreDB: unknown;

jest.mock('@wcpos/core/contexts/app-state', () => ({
	useAppState: () => ({ storeDB: mockStoreDB }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: jest.fn() }),
	setDatabase: jest.fn(),
}));
jest.mock('expo-router', () => ({}));
jest.mock('observable-hooks', () => ({}));
jest.mock('@wcpos/components/error-boundary', () => ({}));
jest.mock('@wcpos/components/portal', () => ({}));
jest.mock('@wcpos/core/hooks/use-app-info', () => ({}));
jest.mock('@wcpos/core/hooks/use-locale', () => ({}));
jest.mock('@wcpos/core/hooks/use-site-info', () => ({}));
jest.mock('@wcpos/core/screens/main/contexts/extra-data', () => ({}));
jest.mock('@wcpos/core/screens/main/contexts/ui-settings', () => ({}));
jest.mock('@wcpos/core/screens/main/hooks/barcodes/device-scan-context', () => ({}));
jest.mock('@wcpos/core/screens/main/upgrade-required', () => ({}));
jest.mock('@wcpos/core/screens/main/hooks/use-collection', () => ({}));
jest.mock('@wcpos/core/screens/main/hooks/use-rest-http-client/refresh-http-client', () => ({}));
jest.mock('@wcpos/core/screens/main/hooks/use-rest-http-client', () => ({}));
jest.mock('@wcpos/hooks/use-http-client/refresh-access-token', () => ({}));
jest.mock('@wcpos/hooks/use-online-status', () => ({}));
jest.mock('@wcpos/printer', () => ({}));
jest.mock('@wcpos/query', () => ({}));
jest.mock('../components/sync-config-bridge', () => ({}));
jest.mock('../components/use-navigation-background', () => ({}));
jest.mock('./connectivity', () => ({}));
jest.mock('./create-app-engine', () => ({}));
jest.mock('./metrics', () => ({
	getMetricsBuckets: jest.fn(),
	hydrateMetricsBuckets: jest.fn(),
	resetMetricsBuckets: jest.fn(),
}));

type StateDocument = {
	get: jest.Mock<() => SyncStatusState | undefined>;
	set: jest.Mock<
		(path: string, update: (current: SyncStatusState) => SyncStatusState) => Promise<void>
	>;
};

function status(at: number): SyncStatusState {
	return {
		products: {
			lastCheckedAt: at,
			lastChangedAt: null,
			lastError: null,
		},
	};
}

function stateDocument(saved?: SyncStatusState): StateDocument {
	return {
		get: jest.fn(() => saved),
		set: jest.fn(
			async (_path: string, _update: (current: SyncStatusState) => SyncStatusState) => undefined
		),
	};
}

function storeWith(statePromise: Promise<StateDocument>) {
	return {
		addState: jest.fn(() => statePromise),
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

async function settle(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

function renderBridge(): ReactTestRenderer {
	let view!: ReactTestRenderer;
	act(() => {
		view = create(<SyncStatusPersistenceBridge />);
	});
	return view;
}

describe('SyncStatusPersistenceBridge', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		resetSyncStatus();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('resets before hydration and ignores a cancelled hydrate after a rapid store switch', async () => {
		hydrateSyncStatus(status(1));
		const firstState = stateDocument(status(10));
		const secondState = stateDocument(status(20));
		const first = deferred<StateDocument>();
		const second = deferred<StateDocument>();
		mockStoreDB = storeWith(first.promise);

		const view = renderBridge();
		expect(getSyncStatusState()).toEqual({});

		mockStoreDB = storeWith(second.promise);
		act(() => view.update(<SyncStatusPersistenceBridge />));
		second.resolve(secondState);
		await settle();
		expect(getSyncStatusState()).toEqual(status(20));

		first.resolve(firstState);
		await settle();
		expect(getSyncStatusState()).toEqual(status(20));
		act(() => view.unmount());
		await settle();
	});

	it('coalesces state changes into one persistence write after five seconds', async () => {
		const state = stateDocument();
		mockStoreDB = storeWith(Promise.resolve(state));
		const view = renderBridge();
		await settle();

		act(() => hydrateSyncStatus(status(10)));
		act(() => jest.advanceTimersByTime(4_999));
		act(() => hydrateSyncStatus(status(20)));
		expect(state.set).not.toHaveBeenCalled();

		await act(async () => {
			jest.advanceTimersByTime(1);
			await Promise.resolve();
		});
		expect(state.set).toHaveBeenCalledTimes(1);
		expect(state.set.mock.calls[0][1]({})).toEqual(status(20));
		act(() => view.unmount());
		await settle();
	});

	it('clears a pending debounce timer on teardown', async () => {
		const state = stateDocument();
		mockStoreDB = storeWith(Promise.resolve(state));
		const view = renderBridge();
		await settle();

		act(() => hydrateSyncStatus(status(10)));
		act(() => view.unmount());
		await settle();
		expect(state.set).toHaveBeenCalledTimes(1);

		await act(async () => {
			jest.advanceTimersByTime(5_000);
			await Promise.resolve();
		});
		expect(state.set).toHaveBeenCalledTimes(1);
	});

	it('skips the teardown flush when the sync-status epoch changed since setup', async () => {
		const state = stateDocument();
		mockStoreDB = storeWith(Promise.resolve(state));
		const view = renderBridge();
		await settle();

		act(() => resetSyncStatus());
		act(() => view.unmount());
		await settle();

		expect(state.set).not.toHaveBeenCalled();
	});

	it('flushes the last state snapshot instead of state reset by the incoming bridge', async () => {
		const firstState = stateDocument();
		const first = deferred<StateDocument>();
		const second = deferred<StateDocument>();
		mockStoreDB = storeWith(first.promise);
		const view = renderBridge();

		act(() => hydrateSyncStatus(status(30)));
		mockStoreDB = storeWith(second.promise);
		act(() => view.update(<SyncStatusPersistenceBridge />));
		expect(getSyncStatusState()).toEqual({});

		first.resolve(firstState);
		await settle();
		expect(firstState.set).toHaveBeenCalledTimes(1);
		expect(firstState.set.mock.calls[0][1]({})).toEqual(status(30));
		act(() => view.unmount());
	});
});
