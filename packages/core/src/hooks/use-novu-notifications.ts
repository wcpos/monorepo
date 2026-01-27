import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';
import { openExternalURL } from '@wcpos/utils/open-external-url';

const novuLogger = getLogger(['wcpos', 'notifications', 'novu']);
import type { NotificationCollection } from '@wcpos/database';

import { useAppState } from '../contexts/app-state';
import { syncSubscriberToServer, useNovu } from '../contexts/novu';
import {
	fetchNotifications,
	getNovuClient,
	markAllAsRead as novuMarkAllAsRead,
	markAllAsSeen as novuMarkAllAsSeen,
	markAsRead as novuMarkAsRead,
	type NovuNotification,
	subscribeToNovuEvents,
	waitForNovuReady,
} from '../services/novu/client';
import { getNotificationBehavior } from '../services/novu/notification-behaviors';

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

/**
 * Hook to manage Novu notifications with local RxDB storage and real-time WebSocket updates.
 *
 * This hook:
 * - Initializes Novu SDK client with WebSocket connection
 * - Listens for real-time notification events
 * - Syncs notifications to local RxDB for offline access
 * - Provides methods to mark as read (updates both Novu and RxDB)
 */
export function useNovuNotifications(): UseNovuNotificationsResult {
	const { storeDB } = useAppState();
	const { subscriberId, subscriberMetadata, isConfigured } = useNovu();
	const [isLoading, setIsLoading] = React.useState(false);
	const [isConnected, setIsConnected] = React.useState(false);

	// Get notifications collection
	const notificationsCollection = storeDB?.notifications as NotificationCollection | undefined;

	// Subscribe to notifications from RxDB
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
				map((docs) =>
					docs.map((doc) => ({
						id: doc.id,
						title: doc.title || '',
						body: doc.body || '',
						status: doc.status as 'unread' | 'read' | 'archived',
						seen: doc.seen ?? false,
						createdAt: doc.createdAt || 0,
						workflowId: doc.workflowId,
					}))
				)
			);
	}, [notificationsCollection, subscriberId]);

	const notifications = useObservableState(notifications$, []);

	// Calculate counts from local data
	const unreadCount = React.useMemo(
		() => notifications.filter((n) => n.status === 'unread').length,
		[notifications]
	);

	const unseenCount = React.useMemo(
		() => notifications.filter((n) => !n.seen).length,
		[notifications]
	);

	/**
	 * Handle action URL - navigates to internal routes or opens external URLs
	 */
	const handleActionUrl = React.useCallback((url: string) => {
		if (!url) return;

		// External URLs (http://, https://)
		if (url.startsWith('http://') || url.startsWith('https://')) {
			openExternalURL(url).catch((error) => {
				novuLogger.error('Novu: Failed to open external URL', { context: { url, error } });
			});
			return;
		}

		// Internal routes - TODO: integrate with navigation when needed
		// For now, just log - the app can implement navigation handling later
		novuLogger.info('Novu: Internal navigation requested', { context: { url } });
	}, []);

	/**
	 * Process notification based on workflow behavior configuration.
	 *
	 * Instead of reading behavior from notification.data (which Novu doesn't reliably pass),
	 * we use client-side configuration keyed by workflow ID. This gives us full flexibility
	 * without Novu's data field limitations.
	 */
	const processNotificationBehavior = React.useCallback(
		(notification: NovuNotification, isNewNotification: boolean) => {
			// Get workflow ID from notification.data (set in Novu workflow config)
			// WebSocket events don't include notification.workflow, so we use data.workflowId
			const data = notification.data as { workflowId?: string } | undefined;
			const workflowId = data?.workflowId;
			const severity = notification.severity as string | undefined;

			// Get behavior config for this workflow
			const behavior = getNotificationBehavior(workflowId, severity);

			const title = notification.subject || '';
			const body = notification.body || '';

			// Only process behavior for NEW notifications (not on initial load/refresh)
			if (!isNewNotification) return;

			if (behavior.showToast) {
				const level = behavior.level || 'info';
				log[level](title, {
					showToast: true,
					saveToDb: behavior.saveToDb,
					// Use body as context object so it's useful when saved to DB
					context: behavior.saveToDb && body ? { body } : undefined,
					toast: {
						text2:
							behavior.toast?.text2 ||
							(behavior.toast?.useBodyAsText2 !== false ? body : undefined),
						dismissable: behavior.toast?.dismissable ?? true,
						action: behavior.toast?.action
							? {
									label: behavior.toast.action.label,
									onClick: () => {
										if (behavior.toast?.action?.url) {
											handleActionUrl(behavior.toast.action.url);
										}
									},
								}
							: undefined,
					},
				});
			} else if (behavior.saveToDb) {
				// Save to logs DB without showing toast
				novuLogger.info(title, {
					saveToDb: true,
					context: body ? { body } : undefined,
				});
			}
		},
		[handleActionUrl]
	);

	/**
	 * Sync a single notification to RxDB (v3 API)
	 *
	 * @param notification - The Novu notification object
	 * @param isNewNotification - Whether this is a newly received notification (triggers behavior)
	 */
	const syncNotificationToRxDB = React.useCallback(
		async (notification: NovuNotification, isNewNotification = false) => {
			if (!notificationsCollection || !subscriberId) return;

			const notificationId = notification.id;
			if (!notificationId) {
				novuLogger.error('Novu: Notification missing ID', {
					context: { keys: Object.keys(notification) },
				});
				return;
			}

			// Process behavior (toast, saveToDb) based on workflow config
			processNotificationBehavior(notification, isNewNotification);

			// Extract workflow ID for storage from notification.data (use null if undefined - RxDB requires string|null, not undefined)
			const data = notification.data as { workflowId?: string } | undefined;
			const workflowId = data?.workflowId ?? null;

			try {
				// Guard against invalid createdAt - Novu v3 types show createdAt as optional string
				const createdAtMs = notification.createdAt
					? new Date(notification.createdAt).getTime()
					: Date.now();
				const safeCreatedAt = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();

				await notificationsCollection.upsert({
					id: String(notificationId),
					subscriberId,
					title: notification.subject || '',
					body: notification.body || '',
					status: notification.isRead ? 'read' : 'unread',
					seen: notification.isSeen ?? false,
					createdAt: safeCreatedAt,
					workflowId,
					channel: notification.channelType || 'in_app',
				});
				novuLogger.debug('Novu: Notification synced to RxDB', { context: { id: notificationId } });
			} catch (error) {
				novuLogger.error('Novu: Failed to sync notification to RxDB', {
					context: { notificationId, error },
				});
			}
		},
		[notificationsCollection, subscriberId, processNotificationBehavior]
	);

	/**
	 * Sync multiple notifications to RxDB (in parallel for performance)
	 * Used for initial load and refresh - these are NOT new notifications, so no toast.
	 */
	const syncToRxDB = React.useCallback(
		async (novuNotifications: NovuNotification[]) => {
			// Pass isNewNotification=false to avoid showing toasts for old notifications
			await Promise.all(
				novuNotifications.map((notification) => syncNotificationToRxDB(notification, false))
			);
		},
		[syncNotificationToRxDB]
	);

	// Track which subscriber IDs we've already synced to prevent duplicates
	const syncedSubscriberRef = React.useRef<string | null>(null);

	/**
	 * Initialize Novu client, set up WebSocket listeners, and sync subscriber.
	 *
	 * IMPORTANT: Server sync (which may trigger welcome) happens AFTER WebSocket is set up,
	 * so the welcome notification can be received in real-time.
	 */
	React.useEffect(() => {
		if (!subscriberId || !subscriberMetadata || !isConfigured) {
			return;
		}

		novuLogger.info('Novu: Setting up client and WebSocket listeners', {
			context: { subscriberId },
		});

		// Initialize the Novu client (this creates the WebSocket connection)
		getNovuClient(subscriberId, subscriberMetadata);
		setIsConnected(true);

		// Subscribe to real-time events (deduplication happens in client.ts)
		const unsubscribe = subscribeToNovuEvents({
			onNotificationReceived: (notification) => {
				const data = notification.data as { workflowId?: string } | undefined;
				novuLogger.info('Novu: Processing notification from WebSocket', {
					context: {
						id: notification.id,
						subject: notification.subject,
						workflowId: data?.workflowId,
					},
				});
				// Pass isNewNotification=true to trigger behavior (toast, etc.)
				syncNotificationToRxDB(notification, true);
			},
			onUnreadCountChanged: (count) => {
				novuLogger.debug('Novu: Unread count updated via WebSocket', { context: { count } });
				// The local RxDB query will update automatically when we sync
			},
		});

		// Sync subscriber to server AFTER WebSocket is connected
		// This ensures welcome notifications can be received in real-time
		const shouldSync = syncedSubscriberRef.current !== subscriberId;

		if (shouldSync) {
			syncedSubscriberRef.current = subscriberId;

			// Wait for Novu SDK to be ready BEFORE triggering server sync
			// This ensures welcome notifications can be received in real-time
			waitForNovuReady(5000).then((connected) => {
				if (!connected) {
					novuLogger.warn('Novu: Socket connection timeout, syncing anyway');
				}

				syncSubscriberToServer(subscriberId, subscriberMetadata)
					.then((result) => {
						if (result.success) {
							novuLogger.info('Novu: Subscriber metadata synced successfully');
						} else {
							novuLogger.warn('Novu: Failed to sync subscriber metadata', {
								context: { error: result.error },
							});
							// Reset on failure so we can retry
							syncedSubscriberRef.current = null;
						}
					})
					.catch((error) => {
						novuLogger.error('Novu: Error syncing subscriber metadata', {
							context: { error: error instanceof Error ? error.message : String(error) },
						});
						syncedSubscriberRef.current = null;
					});
			});
		}

		// Initial fetch of notifications
		setIsLoading(true);
		fetchNotifications()
			.then((notifications) => {
				novuLogger.info('Novu: Initial notifications loaded', {
					context: { count: notifications.length },
				});
				return syncToRxDB(notifications);
			})
			.catch((error) => {
				novuLogger.error('Novu: Failed to load initial notifications', {
					context: { error: error instanceof Error ? error.message : String(error) },
				});
			})
			.finally(() => {
				setIsLoading(false);
			});

		// Cleanup on unmount or subscriber change
		return () => {
			novuLogger.debug('Novu: Cleaning up WebSocket listeners');
			unsubscribe();
			setIsConnected(false);
		};
	}, [subscriberId, subscriberMetadata, isConfigured, syncNotificationToRxDB, syncToRxDB]);

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

			await Promise.all(unreadDocs.map((doc) => doc.patch({ status: 'read', seen: true })));

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

			await Promise.all(unseenDocs.map((doc) => doc.patch({ seen: true })));

			// Then update Novu
			await novuMarkAllAsSeen();
		} catch (error) {
			novuLogger.error('Novu: Failed to mark all notifications as seen', { context: { error } });
		}
	}, [notificationsCollection, subscriberId]);

	// Refresh notifications from Novu server
	const refresh = React.useCallback(async () => {
		if (!isConfigured) {
			novuLogger.warn('Novu: Not configured, skipping refresh');
			return;
		}

		setIsLoading(true);
		try {
			const novuNotifications = await fetchNotifications();
			await syncToRxDB(novuNotifications);
			novuLogger.info('Novu: Notifications refreshed', {
				context: { count: novuNotifications.length },
			});
		} catch (error) {
			novuLogger.error('Novu: Failed to refresh notifications', { context: { error } });
		} finally {
			setIsLoading(false);
		}
	}, [isConfigured, syncToRxDB]);

	return {
		notifications,
		unreadCount,
		unseenCount,
		isLoading,
		isConnected,
		markAsRead,
		markAllAsRead,
		markAllAsSeen,
		refresh,
	};
}
