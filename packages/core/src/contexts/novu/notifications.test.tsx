/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, waitFor } from '@testing-library/react';
import { type Observable, of, Subject } from 'rxjs';

import { NovuNotificationsProvider, useNovuNotifications } from './notifications';
import { stopNovuBootstrap } from '../../services/novu/bootstrap';
import { getNovuClient, subscribeToNovuEvents } from '../../services/novu/client';
import { syncSubscriberToServer } from '../../services/novu/subscriber';

const SUBSCRIBER_ID = 'example.com:1:uuid:web';

const novuContextValue = {
	subscriberId: SUBSCRIBER_ID as string | null,
	subscriberMetadata: null as Record<string, unknown> | null,
	isConfigured: true,
};

/** Rows the mocked RxDB query emits - set per test */
let notificationDocs: Record<string, unknown>[] = [];
/**
 * Replaces the mocked RxDB query stream when a test needs to control *when* it emits.
 * The default `of(notificationDocs)` emits synchronously, which real RxDB never does.
 */
let notificationQuery$: Observable<Record<string, unknown>[]> | null = null;

const notificationsCollection = {
	find: jest.fn(() => ({
		$: notificationQuery$ ?? of(notificationDocs),
		exec: jest.fn(async () => []),
	})),
	findOne: jest.fn(() => ({ exec: jest.fn(async () => null) })),
	upsert: jest.fn(async () => undefined),
};

jest.mock('../app-state', () => ({
	useAppState: () => ({ storeDB: { notifications: notificationsCollection } }),
}));

jest.mock('./config', () => ({
	useNovu: () => novuContextValue,
}));

jest.mock('../../services/novu/client', () => ({
	disconnectNovuClient: jest.fn(),
	fetchNotifications: jest.fn(async () => []),
	getNovuClient: jest.fn(),
	markAllAsRead: jest.fn(async () => true),
	markAllAsSeen: jest.fn(async () => true),
	markAsRead: jest.fn(async () => true),
	subscribeToNovuEvents: jest.fn(() => jest.fn()),
	waitForNovuReady: jest.fn(async () => true),
}));

jest.mock('../../services/novu/subscriber', () => ({
	syncSubscriberToServer: jest.fn(async () => ({ success: true })),
}));

jest.mock('../../services/novu/notification-sync', () => ({
	syncNotificationToRxDB: jest.fn(async () => undefined),
	syncNotificationsToRxDB: jest.fn(async () => undefined),
}));

const mockedGetNovuClient = getNovuClient as jest.MockedFunction<typeof getNovuClient>;
const mockedSubscribe = subscribeToNovuEvents as jest.MockedFunction<typeof subscribeToNovuEvents>;
const mockedSyncSubscriber = syncSubscriberToServer as jest.MockedFunction<
	typeof syncSubscriberToServer
>;

/** Stands in for the bell / panel - both call the shared hook */
function Consumer({ label }: { label: string }) {
	const { unreadCount } = useNovuNotifications();
	return <span data-testid={label}>{unreadCount}</span>;
}

describe('NovuNotificationsProvider', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		notificationDocs = [];
		notificationQuery$ = null;
		novuContextValue.subscriberId = SUBSCRIBER_ID;
		// The provider rebuilds this object on every render - a fresh identity each time
		novuContextValue.subscriberMetadata = { domain: 'example.com', storeId: 1 };
	});

	afterEach(() => {
		act(() => {
			stopNovuBootstrap();
		});
	});

	it('bootstraps once for two concurrent consumers (bell + panel)', async () => {
		render(
			<NovuNotificationsProvider>
				<Consumer label="bell" />
				<Consumer label="panel" />
			</NovuNotificationsProvider>
		);

		await waitFor(() => expect(mockedSyncSubscriber).toHaveBeenCalledTimes(1));

		expect(mockedGetNovuClient).toHaveBeenCalledTimes(1);
		expect(mockedSubscribe).toHaveBeenCalledTimes(1);
	});

	it('does not re-bootstrap when the panel mounts and unmounts', async () => {
		function App({ panelOpen }: { panelOpen: boolean }) {
			return (
				<NovuNotificationsProvider>
					<Consumer label="bell" />
					{/* The panel lives in a popover portal - it mounts on open, unmounts on close */}
					{panelOpen && <Consumer label="panel" />}
				</NovuNotificationsProvider>
			);
		}

		const { rerender } = render(<App panelOpen={false} />);
		await waitFor(() => expect(mockedSyncSubscriber).toHaveBeenCalledTimes(1));

		rerender(<App panelOpen />);
		rerender(<App panelOpen={false} />);
		rerender(<App panelOpen />);

		await waitFor(() => expect(mockedGetNovuClient).toHaveBeenCalledTimes(1));
		expect(mockedSubscribe).toHaveBeenCalledTimes(1);
		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(1);
	});

	it('bootstraps once under StrictMode double-invocation', async () => {
		render(
			<React.StrictMode>
				<NovuNotificationsProvider>
					<Consumer label="bell" />
					<Consumer label="panel" />
				</NovuNotificationsProvider>
			</React.StrictMode>
		);

		await waitFor(() => expect(mockedSyncSubscriber).toHaveBeenCalledTimes(1));

		expect(mockedGetNovuClient).toHaveBeenCalledTimes(1);
		expect(mockedSubscribe).toHaveBeenCalledTimes(1);
	});

	it('shares one state object with every consumer', async () => {
		const seen: unknown[] = [];

		function Recorder() {
			const value = useNovuNotifications();
			seen.push(value);
			return null;
		}

		render(
			<NovuNotificationsProvider>
				<Recorder />
				<Recorder />
			</NovuNotificationsProvider>
		);

		await waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(2));
		expect(seen[0]).toBe(seen[1]);
	});

	it('does not bootstrap when there is no subscriber (logged out)', async () => {
		novuContextValue.subscriberId = null;
		novuContextValue.subscriberMetadata = null;

		render(
			<NovuNotificationsProvider>
				<Consumer label="bell" />
			</NovuNotificationsProvider>
		);

		await waitFor(() => expect(mockedGetNovuClient).not.toHaveBeenCalled());
		expect(mockedSyncSubscriber).not.toHaveBeenCalled();
	});

	it('clears notifications when the subscriber goes away (logout)', async () => {
		notificationDocs = [
			{ id: '1', title: 'Welcome', body: '', status: 'unread', seen: false, createdAt: 1 },
		];

		function App() {
			return (
				<NovuNotificationsProvider>
					<Consumer label="bell" />
				</NovuNotificationsProvider>
			);
		}

		const { rerender, getByTestId } = render(<App />);
		await waitFor(() => expect(getByTestId('bell').textContent).toBe('1'));

		// Logout - the shared provider stays mounted, only the subscriber goes away
		novuContextValue.subscriberId = null;
		novuContextValue.subscriberMetadata = null;
		rerender(<App />);

		await waitFor(() => expect(getByTestId('bell').textContent).toBe('0'));
	});

	it('clears notifications when switching stores, before the new query emits', async () => {
		notificationDocs = [
			{ id: '1', title: 'Store A', body: '', status: 'unread', seen: false, createdAt: 1 },
		];

		function App() {
			return (
				<NovuNotificationsProvider>
					<Consumer label="bell" />
				</NovuNotificationsProvider>
			);
		}

		const { rerender, getByTestId } = render(<App />);
		await waitFor(() => expect(getByTestId('bell').textContent).toBe('1'));

		// A store switch moves `subscriberId` straight from one value to another - it never
		// passes through `null`, so the logout path above doesn't cover it. RxDB resolves the
		// replacement query asynchronously, modelled here by a subject we emit on by hand.
		const storeBQuery = new Subject<Record<string, unknown>[]>();
		notificationQuery$ = storeBQuery.asObservable();
		novuContextValue.subscriberId = 'example.com:2:uuid:web';
		novuContextValue.subscriberMetadata = { domain: 'example.com', storeId: 2 };
		rerender(<App />);

		// Store A's count must be gone even though store B's query hasn't resolved yet
		await waitFor(() => expect(getByTestId('bell').textContent).toBe('0'));

		act(() => {
			storeBQuery.next([
				{ id: '2', title: 'Store B', body: '', status: 'unread', seen: false, createdAt: 2 },
			]);
		});

		await waitFor(() => expect(getByTestId('bell').textContent).toBe('1'));
	});

	it('throws when used outside the provider', () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		expect(() => render(<Consumer label="orphan" />)).toThrow(
			'useNovuNotifications must be used within a NovuProvider'
		);
		spy.mockRestore();
	});
});
