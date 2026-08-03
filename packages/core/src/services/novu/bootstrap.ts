import { BehaviorSubject } from 'rxjs';

import type { NotificationCollection } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';

import {
	disconnectNovuClient,
	fetchNotifications,
	getNovuClient,
	subscribeToNovuEvents,
	waitForNovuReady,
} from './client';
import { syncNotificationsToRxDB, syncNotificationToRxDB } from './notification-sync';
import { type NovuSubscriberMetadata, syncSubscriberToServer } from './subscriber';

const novuLogger = getLogger(['wcpos', 'notifications', 'novu']);

/**
 * Novu bootstrap - the single owner of the Novu session.
 *
 * ## Why this lives outside React
 *
 * The bootstrap sequence (client init → WebSocket subscribe → initial fetch → subscriber
 * metadata sync) is *session* scoped, not *component* scoped. When it lived in
 * `useNovuNotifications()` it ran once per mounted consumer: the notification bell and the
 * notification panel each ran the whole sequence, and because the panel is rendered inside a
 * popover portal it remounts every time the popover opens - a third full bootstrap. See #911.
 *
 * The session is keyed by `subscriberId`. `startNovuBootstrap()` is idempotent for a given
 * subscriber, so it is safe to call from an effect with unstable dependency identities (the
 * `subscriberMetadata` object is rebuilt whenever the site/store/credentials documents change
 * identity) and safe under React StrictMode double-invocation.
 *
 * ## Teardown
 *
 * Teardown is *not* refcounted on consumers - unmounting the bell/panel must never drop the
 * WebSocket. The session is torn down when the session itself ends: `stopNovuBootstrap()` is
 * called when the subscriber goes away (logout) or changes (store switch), mirroring how the
 * app tears down other session-scoped resources.
 */

export interface NovuBootstrapStatus {
	/** Subscriber the current session belongs to, `null` when no session is running */
	subscriberId: string | null;
	/** Whether the initial (or a manual) notification fetch is in flight */
	isLoading: boolean;
	/** Whether the Novu WebSocket reported a ready session */
	isConnected: boolean;
}

export interface StartNovuBootstrapParams {
	subscriberId: string;
	subscriberMetadata: NovuSubscriberMetadata;
	notificationsCollection: NotificationCollection;
}

const IDLE_STATUS: NovuBootstrapStatus = {
	subscriberId: null,
	isLoading: false,
	isConnected: false,
};

const statusSubject = new BehaviorSubject<NovuBootstrapStatus>(IDLE_STATUS);

/** Shared bootstrap status - every consumer subscribes to this one stream */
export const novuBootstrapStatus$ = statusSubject.asObservable();

export function getNovuBootstrapStatus(): NovuBootstrapStatus {
	return statusSubject.getValue();
}

function patchStatus(patch: Partial<NovuBootstrapStatus>): void {
	statusSubject.next({ ...statusSubject.getValue(), ...patch });
}

/** Subscriber id of the running session, `null` when torn down */
let activeSubscriberId: string | null = null;
/** Latest metadata seen for the running session */
let activeMetadata: NovuSubscriberMetadata | null = null;
/** Collection the running session writes notifications into */
let activeCollection: NotificationCollection | null = null;
/** WebSocket event unsubscribe for the running session */
let activeUnsubscribe: (() => void) | null = null;
/** Payload key of the last metadata successfully handed to the server */
let syncedMetadataKey: string | null = null;
/**
 * Whether the running session's socket readiness check has settled.
 *
 * Until it has, metadata syncs are left to the readiness continuation so the subscriber write
 * (and any welcome notification it triggers) happens with the WebSocket up.
 */
let readinessSettled = false;
/**
 * Tail of the metadata sync queue - syncs run one at a time so an older payload can never be
 * applied on top of a newer one.
 */
let metadataSyncChain: Promise<void> = Promise.resolve();
/**
 * Tail of the notification fetch queue.
 *
 * Hydrations and manual refreshes run one at a time because each writes a *whole* snapshot with
 * `upsert`. Left unsequenced, an older response landing last would roll back the read/seen state
 * a newer snapshot had already applied.
 */
let notificationFetchChain: Promise<void> = Promise.resolve();
/**
 * Fetches queued or in flight for the running session.
 *
 * `isLoading` only drops when the last one settles - otherwise the first response to arrive
 * would report the session as loaded while another fetch is still pending.
 */
let pendingNotificationFetches = 0;
/**
 * Bumped on every teardown/restart so async continuations belonging to a previous session
 * cannot write to the state of the current one.
 */
let generation = 0;

/**
 * Stable, order-independent key for a metadata payload.
 *
 * Used to dedupe subscriber syncs: the metadata *object* is rebuilt on every provider render,
 * but the payload we send only rarely changes.
 */
function metadataKey(subscriberId: string, metadata: NovuSubscriberMetadata): string {
	const entries = Object.entries(metadata as unknown as Record<string, unknown>)
		.filter(([, value]) => value !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

	return `${subscriberId}|${JSON.stringify(entries)}`;
}

/**
 * Queue a subscriber metadata sync behind any sync already in flight.
 *
 * Writes are serialized because two *different* payloads both pass the changed-key guard, and
 * if the older request were applied last the server would be left with stale metadata.
 */
function syncMetadataIfChanged(gen: number): Promise<void> {
	const run = metadataSyncChain.then(() => performMetadataSync(gen));
	// The chain itself must never reject, or every later sync would be skipped
	metadataSyncChain = run.catch(() => undefined);
	return run;
}

/**
 * Sync subscriber metadata to the server, but only when the payload actually changed.
 *
 * The payload is read when this actually runs (not when it was queued), so a sync that waited
 * behind an earlier one always sends the latest metadata and collapses any intermediate values.
 *
 * WHAT gets sent is unchanged from the previous per-consumer implementation - this only
 * removes the duplicate requests.
 */
async function performMetadataSync(gen: number): Promise<void> {
	if (gen !== generation) return;

	const subscriberId = activeSubscriberId;
	const metadata = activeMetadata;
	if (!subscriberId || !metadata) return;

	const key = metadataKey(subscriberId, metadata);
	if (syncedMetadataKey === key) return;

	// Claim the key before awaiting so a concurrent call can't fire the same request twice
	syncedMetadataKey = key;

	try {
		const result = await syncSubscriberToServer(subscriberId, metadata);
		if (result.success) {
			novuLogger.info('Novu: Subscriber metadata synced successfully');
			return;
		}

		novuLogger.warn('Novu: Failed to sync subscriber metadata', {
			context: { error: result.error },
		});
		// Reset on failure so we can retry
		if (syncedMetadataKey === key) syncedMetadataKey = null;
	} catch (error) {
		novuLogger.error('Novu: Error syncing subscriber metadata', {
			context: { error: error instanceof Error ? error.message : String(error) },
		});
		if (syncedMetadataKey === key) syncedMetadataKey = null;
	}
}

/**
 * Queue a notification fetch behind any fetch already in flight.
 *
 * Both entry points (session hydration and manual refresh) go through here, so a collection
 * swap during an open fetch - or a user-triggered refresh landing on top of one - can never
 * apply snapshots out of order.
 */
function queueNotificationFetch(gen: number, source: 'initial' | 'refresh'): Promise<void> {
	if (gen !== generation) return Promise.resolve();

	pendingNotificationFetches += 1;
	patchStatus({ isLoading: true });

	const run = notificationFetchChain.then(() => fetchAndSyncNotifications(gen, source));
	// The chain itself must never reject, or every later fetch would be skipped
	notificationFetchChain = run.catch(() => undefined);

	return run.finally(() => {
		// A torn-down session's counter was already reset by `stopNovuBootstrap`
		if (gen !== generation) return;

		pendingNotificationFetches -= 1;
		if (pendingNotificationFetches === 0) {
			patchStatus({ isLoading: false });
		}
	});
}

/**
 * Fetch the current notification snapshot and write it into the session's collection.
 *
 * The collection and subscriber are read when this actually runs rather than when it was
 * queued, so a fetch that waited behind an earlier one always writes into the current
 * collection. Callers must go through `queueNotificationFetch`.
 */
async function fetchAndSyncNotifications(
	gen: number,
	source: 'initial' | 'refresh'
): Promise<void> {
	if (gen !== generation) return;

	try {
		const notifications = await fetchNotifications();
		if (gen !== generation) return;

		const collection = activeCollection;
		const subscriberId = activeSubscriberId;
		if (!collection || !subscriberId) return;

		await syncNotificationsToRxDB(collection, subscriberId, notifications);
		if (gen !== generation) return;

		novuLogger.info(
			source === 'initial' ? 'Novu: Initial notifications loaded' : 'Novu: Notifications refreshed',
			{ context: { count: notifications.length } }
		);
	} catch (error) {
		if (gen !== generation) return;
		novuLogger.error(
			source === 'initial'
				? 'Novu: Failed to load initial notifications'
				: 'Novu: Failed to refresh notifications',
			{ context: { error: error instanceof Error ? error.message : String(error) } }
		);
	}
}

/**
 * Start (or adopt) the Novu session for a subscriber.
 *
 * Idempotent: calling this again for the same `subscriberId` does not re-initialize the
 * client, re-subscribe to the WebSocket, or re-fetch notifications. It only re-syncs
 * subscriber metadata if the payload content changed.
 *
 * Calling it with a different `subscriberId` tears the previous session down first.
 */
export function startNovuBootstrap({
	subscriberId,
	subscriberMetadata,
	notificationsCollection,
}: StartNovuBootstrapParams): void {
	if (activeSubscriberId === subscriberId) {
		// Same session - adopt the latest metadata/collection without re-bootstrapping
		const collectionReplaced =
			activeCollection !== null && activeCollection !== notificationsCollection;

		activeMetadata = subscriberMetadata;
		activeCollection = notificationsCollection;

		if (readinessSettled) {
			void syncMetadataIfChanged(generation);
		}
		// else: the readiness continuation hasn't run yet - it reads `activeMetadata` when it
		// does, so syncing here would only claim the dedupe key early and send the subscriber
		// write before the WebSocket is up, losing any welcome notification it triggers.

		if (collectionReplaced) {
			// The RxDB collection was reset and recreated (e.g. Clear & Sync). The replacement is
			// empty, so re-hydrate it instead of leaving history and badge counts blank until the
			// next WebSocket event or manual refresh.
			novuLogger.info('Novu: Notifications collection replaced, re-hydrating');
			void queueNotificationFetch(generation, 'initial');
		}

		return;
	}

	// Different subscriber (login / store switch) - the old session must go first
	stopNovuBootstrap();

	const gen = (generation += 1);
	activeSubscriberId = subscriberId;
	activeMetadata = subscriberMetadata;
	activeCollection = notificationsCollection;
	readinessSettled = false;

	novuLogger.info('Novu: Setting up client and WebSocket listeners', {
		context: { subscriberId },
	});

	// Initialize the Novu client (this creates the WebSocket connection).
	getNovuClient(subscriberId, subscriberMetadata);

	// Subscribe to real-time events (deduplication happens in client.ts)
	activeUnsubscribe = subscribeToNovuEvents({
		onNotificationReceived: (notification) => {
			if (gen !== generation) return;

			const data = notification.data as { workflowId?: string } | undefined;
			novuLogger.info('Novu: Processing notification from WebSocket', {
				context: {
					id: notification.id,
					subject: notification.subject,
					workflowId: data?.workflowId,
				},
			});

			const collection = activeCollection;
			const activeId = activeSubscriberId;
			if (!collection || !activeId) return;

			// Pass isNewNotification=true to trigger behavior (toast, etc.)
			void syncNotificationToRxDB(collection, activeId, notification, true);
		},
		onUnreadCountChanged: (count) => {
			novuLogger.debug('Novu: Unread count updated via WebSocket', { context: { count } });
			// The local RxDB query will update automatically when we sync
		},
	});

	statusSubject.next({ subscriberId, isLoading: false, isConnected: false });

	// Sync subscriber to server AFTER the WebSocket is connected so welcome notifications
	// triggered by the sync can be received in real time.
	void (async () => {
		let connected = false;

		try {
			connected = await waitForNovuReady(5000);
			if (gen !== generation) return;

			if (!connected) {
				novuLogger.warn('Novu: Socket connection timeout, syncing anyway');
			}
		} catch (error) {
			if (gen !== generation) return;
			novuLogger.error('Novu: Socket readiness check failed', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
		}

		if (gen !== generation) return;

		patchStatus({ isConnected: connected });

		// Repeat starts may sync inline from here on - the socket is either up or given up on
		readinessSettled = true;

		// Syncs the latest metadata, including anything adopted while this was pending
		await syncMetadataIfChanged(gen);
	})();

	void queueNotificationFetch(gen, 'initial');
}

/**
 * Tear the Novu session down.
 *
 * Called when the session ends (logout) or is replaced (store switch) - never on consumer
 * unmount. No-op when no session is running.
 */
export function stopNovuBootstrap(): void {
	if (!activeSubscriberId && !activeUnsubscribe) return;

	// Invalidate in-flight continuations from the session being torn down
	generation += 1;

	if (activeUnsubscribe) {
		novuLogger.debug('Novu: Cleaning up WebSocket listeners');
		activeUnsubscribe();
		activeUnsubscribe = null;
	}

	disconnectNovuClient();

	activeSubscriberId = null;
	activeMetadata = null;
	activeCollection = null;
	syncedMetadataKey = null;
	readinessSettled = false;
	pendingNotificationFetches = 0;

	// Don't make the next session queue behind a dead one's in-flight request. Continuations from
	// the torn-down session already bail on the generation check, so dropping the tails loses
	// nothing.
	metadataSyncChain = Promise.resolve();
	notificationFetchChain = Promise.resolve();

	statusSubject.next(IDLE_STATUS);
}

/**
 * Re-fetch notifications from Novu for the running session.
 */
export async function refreshNovuNotifications(): Promise<void> {
	if (!activeSubscriberId || !activeCollection) {
		novuLogger.warn('Novu: Not configured, skipping refresh');
		return;
	}

	await queueNotificationFetch(generation, 'refresh');
}
