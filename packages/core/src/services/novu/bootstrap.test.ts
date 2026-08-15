import type { NotificationCollection } from '@wcpos/database';

import { getNovuBootstrapStatus, startNovuBootstrap, stopNovuBootstrap } from './bootstrap';
import {
	disconnectNovuClient,
	fetchNotifications,
	getNovuClient,
	subscribeToNovuEvents,
	waitForNovuReady,
} from './client';
import { syncNotificationsToRxDB } from './notification-sync';
import { syncSubscriberToServer } from './subscriber';

import type { NovuNotification } from './client';
import type { NovuSubscriberMetadata } from './subscriber';

const unsubscribeSpy = jest.fn();

jest.mock('./client', () => ({
	disconnectNovuClient: jest.fn(),
	fetchNotifications: jest.fn(async () => []),
	getNovuClient: jest.fn(),
	subscribeToNovuEvents: jest.fn(() => unsubscribeSpy),
	waitForNovuReady: jest.fn(async () => true),
}));

jest.mock('./subscriber', () => ({
	syncSubscriberToServer: jest.fn(async () => ({ success: true })),
}));

jest.mock('./notification-sync', () => ({
	syncNotificationToRxDB: jest.fn(async () => undefined),
	syncNotificationsToRxDB: jest.fn(async () => undefined),
}));

const mockedGetNovuClient = getNovuClient as jest.MockedFunction<typeof getNovuClient>;
const mockedSubscribe = subscribeToNovuEvents as jest.MockedFunction<typeof subscribeToNovuEvents>;
const mockedFetch = fetchNotifications as jest.MockedFunction<typeof fetchNotifications>;
const mockedWaitForReady = waitForNovuReady as jest.MockedFunction<typeof waitForNovuReady>;
const mockedDisconnect = disconnectNovuClient as jest.MockedFunction<typeof disconnectNovuClient>;
const mockedSyncSubscriber = syncSubscriberToServer as jest.MockedFunction<
	typeof syncSubscriberToServer
>;
const mockedSyncToRxDB = syncNotificationsToRxDB as jest.MockedFunction<
	typeof syncNotificationsToRxDB
>;

/** Metadata is rebuilt on every provider render - a fresh object with identical content */
function makeMetadata(overrides: Partial<NovuSubscriberMetadata> = {}): NovuSubscriberMetadata {
	return {
		domain: 'example.com',
		storeId: 1,
		appVersion: '1.9.1',
		platform: 'web',
		locale: 'en_US',
		...overrides,
	};
}

const collection = {} as NotificationCollection;

const SUBSCRIBER_ID = 'example.com:1:uuid:web';

async function flush() {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('novu bootstrap', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedFetch.mockResolvedValue([]);
		mockedWaitForReady.mockResolvedValue(true);
		mockedSyncSubscriber.mockResolvedValue({ success: true });
		mockedSubscribe.mockReturnValue(unsubscribeSpy);
	});

	afterEach(() => {
		stopNovuBootstrap();
	});

	it('runs the init sequence once for two concurrent consumers', async () => {
		// Two consumers (bell + panel) each drive the owner effect with their own metadata object
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});

		await flush();

		expect(mockedGetNovuClient).toHaveBeenCalledTimes(1);
		expect(mockedSubscribe).toHaveBeenCalledTimes(1);
		expect(mockedFetch).toHaveBeenCalledTimes(1);
		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(1);
	});

	it('does not re-bootstrap when a consumer remounts (panel open/close)', async () => {
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		// Panel closes and reopens - a brand new metadata object identity, same content
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		expect(mockedGetNovuClient).toHaveBeenCalledTimes(1);
		expect(mockedSubscribe).toHaveBeenCalledTimes(1);
		expect(mockedFetch).toHaveBeenCalledTimes(1);
		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(1);
		expect(unsubscribeSpy).not.toHaveBeenCalled();
	});

	it('sends the same metadata payload it always did', async () => {
		const metadata = makeMetadata();
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: metadata,
			notificationsCollection: collection,
		});
		await flush();

		expect(mockedSyncSubscriber).toHaveBeenCalledWith(SUBSCRIBER_ID, metadata);
	});

	it('re-syncs metadata when the payload content changes, without re-bootstrapping', async () => {
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata({ licenseStatus: 'active' }),
			notificationsCollection: collection,
		});
		await flush();

		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(2);
		expect(mockedGetNovuClient).toHaveBeenCalledTimes(1);
		expect(mockedFetch).toHaveBeenCalledTimes(1);
	});

	it('re-hydrates when the notifications collection is replaced', async () => {
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		expect(mockedFetch).toHaveBeenCalledTimes(1);

		// Clear & Sync drops the RxDB collection and hands back an empty replacement
		const replacement = {} as NotificationCollection;
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: replacement,
		});
		await flush();

		// Re-fetched into the replacement, but still the same session
		expect(mockedFetch).toHaveBeenCalledTimes(2);
		expect(mockedSyncToRxDB).toHaveBeenLastCalledWith(replacement, SUBSCRIBER_ID, []);
		expect(mockedGetNovuClient).toHaveBeenCalledTimes(1);
		expect(mockedSubscribe).toHaveBeenCalledTimes(1);
		expect(unsubscribeSpy).not.toHaveBeenCalled();
	});

	it('serializes notification fetches so a stale snapshot cannot land last', async () => {
		const pending: ((notifications: NovuNotification[]) => void)[] = [];
		mockedFetch.mockImplementation(
			() =>
				new Promise<NovuNotification[]>((resolve) => {
					pending.push(resolve);
				})
		);

		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		expect(mockedFetch).toHaveBeenCalledTimes(1);

		// Clear & Sync swaps the collection while the initial fetch is still open
		const replacement = {} as NotificationCollection;
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: replacement,
		});
		await flush();

		// Queued behind the open fetch rather than racing it
		expect(mockedFetch).toHaveBeenCalledTimes(1);

		const older = [{ id: 'older' }] as unknown as NovuNotification[];
		pending[0](older);
		await flush();

		expect(mockedFetch).toHaveBeenCalledTimes(2);
		expect(mockedSyncToRxDB).toHaveBeenCalledTimes(1);
		expect(mockedSyncToRxDB).toHaveBeenCalledWith(replacement, SUBSCRIBER_ID, older);

		const newer = [{ id: 'newer' }] as unknown as NovuNotification[];
		pending[1](newer);
		await flush();

		// The newer snapshot is written last, so it cannot be rolled back by the older one
		expect(mockedSyncToRxDB).toHaveBeenCalledTimes(2);
		expect(mockedSyncToRxDB).toHaveBeenLastCalledWith(replacement, SUBSCRIBER_ID, newer);
	});

	it('keeps isLoading set until the last queued fetch settles', async () => {
		const pending: ((notifications: NovuNotification[]) => void)[] = [];
		mockedFetch.mockImplementation(
			() =>
				new Promise<NovuNotification[]>((resolve) => {
					pending.push(resolve);
				})
		);

		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: {} as NotificationCollection,
		});
		await flush();

		expect(getNovuBootstrapStatus().isLoading).toBe(true);

		pending[0]([]);
		await flush();

		// The first fetch is done but the re-hydration is not - the session is still loading
		expect(getNovuBootstrapStatus().isLoading).toBe(true);

		pending[1]([]);
		await flush();

		expect(getNovuBootstrapStatus().isLoading).toBe(false);
	});

	it('defers a repeat metadata sync until the socket readiness check resolves', async () => {
		let resolveReady: (value: boolean) => void = () => undefined;
		mockedWaitForReady.mockReturnValueOnce(
			new Promise<boolean>((resolve) => {
				resolveReady = resolve;
			})
		);

		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		// The effect runs again (StrictMode / new metadata) before the socket is up
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata({ licenseStatus: 'active' }),
			notificationsCollection: collection,
		});
		await flush();

		// Nothing sent yet - a welcome notification triggered now would be missed
		expect(mockedSyncSubscriber).not.toHaveBeenCalled();

		resolveReady(true);
		await flush();

		// One write, carrying the metadata adopted while the readiness check was pending
		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(1);
		expect(mockedSyncSubscriber).toHaveBeenCalledWith(
			SUBSCRIBER_ID,
			makeMetadata({ licenseStatus: 'active' })
		);
	});

	it('serializes metadata writes so a stale payload cannot land last', async () => {
		const pending: ((result: { success: boolean }) => void)[] = [];
		mockedSyncSubscriber.mockImplementation(
			() =>
				new Promise<{ success: boolean }>((resolve) => {
					pending.push(resolve);
				})
		);

		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(1);

		// Metadata changes while the first write is still open
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata({ licenseStatus: 'active' }),
			notificationsCollection: collection,
		});
		await flush();

		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(1);

		pending[0]({ success: true });
		await flush();

		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(2);
		expect(mockedSyncSubscriber).toHaveBeenLastCalledWith(
			SUBSCRIBER_ID,
			makeMetadata({ licenseStatus: 'active' })
		);

		pending[1]?.({ success: true });
		await flush();
	});

	it('retries the metadata sync after a failure', async () => {
		mockedSyncSubscriber.mockResolvedValueOnce({ success: false, error: 'boom' });

		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(2);
	});

	it('tears down and re-bootstraps when the subscriber changes (store switch)', async () => {
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		startNovuBootstrap({
			subscriberId: 'example.com:2:uuid:web',
			subscriberMetadata: makeMetadata({ storeId: 2 }),
			notificationsCollection: collection,
		});
		await flush();

		expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
		expect(mockedDisconnect).toHaveBeenCalledTimes(1);
		expect(mockedGetNovuClient).toHaveBeenCalledTimes(2);
		expect(mockedSubscribe).toHaveBeenCalledTimes(2);
		expect(mockedFetch).toHaveBeenCalledTimes(2);
		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(2);
		expect(getNovuBootstrapStatus().subscriberId).toBe('example.com:2:uuid:web');
	});

	it('tears the session down on stop (logout) and can start clean afterwards', async () => {
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		stopNovuBootstrap();

		expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
		expect(mockedDisconnect).toHaveBeenCalledTimes(1);
		expect(getNovuBootstrapStatus()).toEqual({
			subscriberId: null,
			isLoading: false,
			isConnected: false,
		});

		// Logging back in as the same subscriber bootstraps again
		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});
		await flush();

		expect(mockedGetNovuClient).toHaveBeenCalledTimes(2);
		expect(mockedSyncSubscriber).toHaveBeenCalledTimes(2);
	});

	it('is a no-op to stop when no session is running', () => {
		stopNovuBootstrap();
		stopNovuBootstrap();

		expect(mockedDisconnect).not.toHaveBeenCalled();
	});

	it('ignores late readiness results from a torn-down session', async () => {
		let resolveReady: (value: boolean) => void = () => undefined;
		mockedWaitForReady.mockReturnValueOnce(
			new Promise<boolean>((resolve) => {
				resolveReady = resolve;
			})
		);

		startNovuBootstrap({
			subscriberId: SUBSCRIBER_ID,
			subscriberMetadata: makeMetadata(),
			notificationsCollection: collection,
		});

		stopNovuBootstrap();
		resolveReady(true);
		await flush();

		// The stale continuation must not sync metadata or flip the status back on
		expect(mockedSyncSubscriber).not.toHaveBeenCalled();
		expect(getNovuBootstrapStatus().isConnected).toBe(false);
	});
});
