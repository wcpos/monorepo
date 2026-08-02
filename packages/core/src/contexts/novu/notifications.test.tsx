/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

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

const notificationsCollection = {
	find: jest.fn(() => ({ $: of([]), exec: jest.fn(async () => []) })),
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

	it('throws when used outside the provider', () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		expect(() => render(<Consumer label="orphan" />)).toThrow(
			'useNovuNotifications must be used within a NovuProvider'
		);
		spy.mockRestore();
	});
});
