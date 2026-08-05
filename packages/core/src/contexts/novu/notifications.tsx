import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { type Observable, of } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

import type { NotificationCollection, NotificationDocument } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';

import { useNovu } from './config';
import { useAppState } from '../app-state';
import {
	getNovuBootstrapStatus,
	novuBootstrapStatus$,
	refreshNovuNotifications,
	startNovuBootstrap,
	stopNovuBootstrap,
} from '../../services/novu/bootstrap';
import {
	markAllAsRead as novuMarkAllAsRead,
	markAllAsSeen as novuMarkAllAsSeen,
	markAsRead as novuMarkAsRead,
} from '../../services/novu/client';

const novuLogger = getLogger(['wcpos', 'notifications', 'novu']);

export interface Notification {
	id: string;
	title: string;
	body: string;
	status: 'unread' | 'read' | 'archived';
	seen: boolean;
	createdAt: number;
	workflowId?: string;
}

export interface UseNovuNotificationsResult {
	/** List of notifications */
	notifications: Notification[];
	/** Number of unread notifications */
	unreadCount: number;
	/** Number of unseen notifications */
	unseenCount: number;
	/** Whether notifications are loading */
	isLoading: boolean;
	/** Whether the Novu client is connected */
	isConnected: boolean;
	/** Mark a notification as read */
	markAsRead: (notificationId: string) => Promise<void>;
	/** Mark all notifications as read */
	markAllAsRead: () => Promise<void>;
	/** Mark all notifications as seen (without marking as read) */
	markAllAsSeen: () => Promise<void>;
	/** Refresh notifications from server */
	refresh: () => Promise<void>;
}

const NovuNotificationsContext = React.createContext<UseNovuNotificationsResult | undefined>(
	undefined
);

const EMPTY_NOTIFICATIONS: Notification[] = [];

/**
 * Stand-in stream for "no subscriber".
 *
 * It has to *emit* `[]` rather than be `EMPTY`: this provider outlives logout, so a stream that
 * never emits would leave the previous session's notifications on screen (the hook's initial
 * value only applies on first mount). Module scope keeps the identity stable so swapping to it
 * is the only thing that triggers a resubscribe.
 *
 * This covers logout (`subscriberId` -> `null`). A store switch changes `subscriberId` from one
 * value straight to another and never swaps in this stream, so the real query clears itself with
 * `startWith(EMPTY_NOTIFICATIONS)` below.
 */
const EMPTY_NOTIFICATIONS$ = of(EMPTY_NOTIFICATIONS);

interface NovuNotificationsProviderProps {
	children: React.ReactNode;
}

/**
 * NovuNotificationsProvider is the single owner of the Novu notification session.
 *
 * It owns the bootstrap (client init, WebSocket subscription, initial fetch, subscriber
 * metadata sync) and the single RxDB query that backs every consumer. Components read the
 * shared state through `useNovuNotifications()` - mounting or unmounting a consumer (the bell,
 * the panel inside its popover portal) never re-runs the bootstrap. See #911.
 */
export function NovuNotificationsProvider({ children }: NovuNotificationsProviderProps) {
	const { storeDB } = useAppState();
	const { subscriberId, subscriberMetadata, isConfigured } = useNovu();

	// Get notifications collection
	const notificationsCollection = storeDB?.notifications as NotificationCollection | undefined;

	/**
	 * Drive the session from this one effect.
	 *
	 * The effect body is deliberately dependency-tolerant: `startNovuBootstrap` is keyed by
	 * `subscriberId` and is a no-op when the session is already running, so re-runs caused by
	 * unstable `subscriberMetadata`/`storeDB` identities (or StrictMode double-invocation) do
	 * not re-bootstrap. There is no cleanup function: the session outlives this effect's
	 * re-runs and is only torn down when the subscriber goes away (logout) or changes
	 * (store switch), which shows up here as a new dependency value.
	 */
	React.useEffect(() => {
		if (!subscriberId || !subscriberMetadata || !isConfigured || !notificationsCollection) {
			stopNovuBootstrap();
			return;
		}

		startNovuBootstrap({ subscriberId, subscriberMetadata, notificationsCollection });
	}, [subscriberId, subscriberMetadata, isConfigured, notificationsCollection]);

	// Shared bootstrap status (one stream, every consumer reads the same values)
	const status = useObservableState(novuBootstrapStatus$, getNovuBootstrapStatus());
	const isConnected = status.subscriberId === subscriberId && status.isConnected;

	// Subscribe to notifications from RxDB - one query for the whole app
	const notifications$ = React.useMemo(() => {
		if (!notificationsCollection || !subscriberId) {
			return null;
		}

		return notificationsCollection
			.find({
				selector: {
					subscriberId,
				},
				sort: [{ createdAt: 'desc' }],
			})
			.$.pipe(
				map((docs: NotificationDocument[]) =>
					docs.map((doc) => ({
						id: doc.id ?? '',
						title: doc.title || '',
						body: doc.body || '',
						status: doc.status as 'unread' | 'read' | 'archived',
						seen: doc.seen ?? false,
						createdAt: doc.createdAt ?? 0,
						workflowId: doc.workflowId ?? undefined,
					}))
				),
				// The RxDB query emits asynchronously, so without this the previous session's
				// notifications and badge counts stay on screen until the new query resolves.
				// This observable is only rebuilt when the subscriber or collection changes -
				// i.e. when the old list is already invalid - so there is nothing to preserve.
				startWith(EMPTY_NOTIFICATIONS)
			);
	}, [notificationsCollection, subscriberId]);

	const notifications: Notification[] = useObservableState(
		(notifications$ ?? EMPTY_NOTIFICATIONS$) as Observable<Notification[]>,
		EMPTY_NOTIFICATIONS
	);

	// Calculate counts from local data
	const unreadCount = React.useMemo(
		() => notifications.filter((n) => n.status === 'unread').length,
		[notifications]
	);

	const unseenCount = React.useMemo(
		() => notifications.filter((n) => !n.seen).length,
		[notifications]
	);

	// Mark a single notification as read (both Novu and RxDB)
	const markAsRead = React.useCallback(
		async (notificationId: string) => {
			if (!notificationsCollection) return;

			try {
				// Update RxDB first for immediate UI feedback
				const doc = await notificationsCollection.findOne(notificationId).exec();
				if (doc) {
					await doc.patch({ status: 'read', seen: true });
				}

				// Then update Novu
				await novuMarkAsRead(notificationId);
			} catch (error) {
				novuLogger.error('Novu: Failed to mark notification as read', { context: { error } });
			}
		},
		[notificationsCollection]
	);

	// Mark all notifications as read (both Novu and RxDB)
	const markAllAsRead = React.useCallback(async () => {
		if (!notificationsCollection || !subscriberId) return;

		try {
			// Update RxDB first
			const unreadDocs = await notificationsCollection
				.find({
					selector: {
						subscriberId,
						status: 'unread',
					},
				})
				.exec();

			await Promise.all(
				unreadDocs.map((doc: NotificationDocument) => doc.patch({ status: 'read', seen: true }))
			);

			// Then update Novu
			await novuMarkAllAsRead();
		} catch (error) {
			novuLogger.error('Novu: Failed to mark all notifications as read', { context: { error } });
		}
	}, [notificationsCollection, subscriberId]);

	// Mark all notifications as seen without marking as read (both Novu and RxDB)
	const markAllAsSeen = React.useCallback(async () => {
		if (!notificationsCollection || !subscriberId) return;

		try {
			// Update RxDB first - only set seen: true, don't change status
			const unseenDocs = await notificationsCollection
				.find({
					selector: {
						subscriberId,
						seen: false,
					},
				})
				.exec();

			await Promise.all(unseenDocs.map((doc: NotificationDocument) => doc.patch({ seen: true })));

			// Then update Novu
			await novuMarkAllAsSeen();
		} catch (error) {
			novuLogger.error('Novu: Failed to mark all notifications as seen', { context: { error } });
		}
	}, [notificationsCollection, subscriberId]);

	// Refresh notifications from Novu server
	const refresh = React.useCallback(async () => {
		await refreshNovuNotifications();
	}, []);

	const value = React.useMemo<UseNovuNotificationsResult>(
		() => ({
			notifications,
			unreadCount,
			unseenCount,
			isLoading: status.isLoading,
			isConnected,
			markAsRead,
			markAllAsRead,
			markAllAsSeen,
			refresh,
		}),
		[
			notifications,
			unreadCount,
			unseenCount,
			status.isLoading,
			isConnected,
			markAsRead,
			markAllAsRead,
			markAllAsSeen,
			refresh,
		]
	);

	return (
		<NovuNotificationsContext.Provider value={value}>{children}</NovuNotificationsContext.Provider>
	);
}

/**
 * Hook to read the shared Novu notification state.
 *
 * This is a thin subscription - all initialization is owned by `NovuNotificationsProvider`.
 */
export function useNovuNotifications(): UseNovuNotificationsResult {
	const context = React.useContext(NovuNotificationsContext);
	if (!context) {
		throw new Error('useNovuNotifications must be used within a NovuProvider');
	}
	return context;
}
