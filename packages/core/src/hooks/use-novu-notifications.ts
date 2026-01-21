import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import log from '@wcpos/utils/logger';
import { openExternalURL } from '@wcpos/utils/open-external-url';
import type { NotificationCollection } from '@wcpos/database';

import { useAppState } from '../contexts/app-state';
import { useNovu } from '../contexts/novu';
import {
	fetchNotifications,
	getNovuClient,
	markAllAsRead as novuMarkAllAsRead,
	markAllAsSeen as novuMarkAllAsSeen,
	markAsRead as novuMarkAsRead,
	type NovuNotification,
	subscribeToNovuEvents,
} from '../services/novu/client';

/**
 * Notification payload schema - matches server-side payload structure.
 *
 * These options control how the notification is displayed and stored,
 * using the same API as the logger for consistency.
 */
export interface NotificationPayload {
	// Content (set in Novu workflow template via {{payload.subject}}, {{payload.body}})
	subject?: string;
	body?: string;

	// Logger-compatible options
	/** Show a toast notification when received (default: false) */
	showToast?: boolean;
	/** Save to the logs database for troubleshooting (default: false) */
	saveToDb?: boolean;

	// Toast customization (mirrors LoggerOptions.toast)
	toast?: {
		/** Secondary message shown below the title */
		text2?: string;
		/** Show close button on toast (default: true) */
		dismissable?: boolean;
		/** Action button configuration */
		action?: {
			/** Button label (e.g., "Update Now", "View", "Renew") */
			label: string;
			/** URL to open - can be internal route (/settings) or external (https://...) */
			url?: string;
		};
	};

	// Notification-specific metadata
	/** Toast type/color: info (blue), success (green), warn (yellow), error (red) */
	level?: 'info' | 'success' | 'warn' | 'error';
	/** Category for filtering/grouping */
	category?: 'update' | 'announcement' | 'alert' | 'system' | 'welcome';
	/** ISO date string - notification should be hidden after this time */
	expiresAt?: string;

	// Additional custom data (extensible)
	[key: string]: unknown;
}

export interface Notification {
	id: string;
	title: string;
	body: string;
	status: 'unread' | 'read' | 'archived';
	seen: boolean;
	createdAt: number;
	payload?: NotificationPayload;
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
						payload: doc.payload,
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
				log.error('Novu: Failed to open external URL', { context: { url, error } });
			});
			return;
		}

		// Internal routes - TODO: integrate with navigation when needed
		// For now, just log - the app can implement navigation handling later
		log.info('Novu: Internal navigation requested', { context: { url } });
	}, []);

	/**
	 * Process notification payload options (showToast, saveToDb, etc.)
	 * Uses the same API as the logger for consistency.
	 */
	const processNotificationPayload = React.useCallback(
		(notification: NovuNotification, isNewNotification: boolean) => {
			const payload = (notification.data as NotificationPayload) || {};
			const title = notification.subject || payload.subject || '';
			const body = notification.body || payload.body || '';

			// Only show toast for NEW notifications (not on initial load/refresh)
			if (isNewNotification && payload.showToast) {
				const level = payload.level || 'info';

				log[level](title, {
					showToast: true,
					saveToDb: payload.saveToDb,
					context: {
						notificationId: notification.id,
						category: payload.category,
					},
					toast: {
						text2: payload.toast?.text2 || body,
						dismissable: payload.toast?.dismissable ?? true,
						action: payload.toast?.action
							? {
									label: payload.toast.action.label,
									onClick: () => {
										if (payload.toast?.action?.url) {
											handleActionUrl(payload.toast.action.url);
										}
									},
								}
							: undefined,
					},
				});
			} else if (payload.saveToDb) {
				// Save to logs DB without showing toast
				log.info(title, {
					saveToDb: true,
					context: {
						notificationId: notification.id,
						body,
						category: payload.category,
					},
				});
			}
		},
		[handleActionUrl]
	);

	/**
	 * Sync a single notification to RxDB (v3 API)
	 * Note: v3 uses `data` instead of `payload` for custom data
	 *
	 * @param notification - The Novu notification object
	 * @param isNewNotification - Whether this is a newly received notification (shows toast)
	 */
	const syncNotificationToRxDB = React.useCallback(
		async (notification: NovuNotification, isNewNotification = false) => {
			if (!notificationsCollection || !subscriberId) return;

			const notificationId = notification.id;
			if (!notificationId) {
				log.error('Novu: Notification missing ID', {
					context: { keys: Object.keys(notification) },
				});
				return;
			}

			// Process payload options (toast, saveToDb) for new notifications
			processNotificationPayload(notification, isNewNotification);

			try {
				await notificationsCollection.upsert({
					id: String(notificationId),
					subscriberId,
					title: notification.subject || '',
					body: notification.body || '',
					status: notification.isRead ? 'read' : 'unread',
					seen: notification.isSeen ?? false,
					createdAt: new Date(notification.createdAt).getTime(),
					// v3 uses `data` instead of `payload`
					payload: (notification.data as NotificationPayload) || {},
					channel: notification.channelType || 'in_app',
				});
				log.debug('Novu: Notification synced to RxDB', { context: { id: notificationId } });
			} catch (error) {
				log.error('Novu: Failed to sync notification to RxDB', {
					context: { notificationId, error },
				});
			}
		},
		[notificationsCollection, subscriberId, processNotificationPayload]
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

	/**
	 * Initialize Novu client and set up WebSocket listeners
	 */
	React.useEffect(() => {
		if (!subscriberId || !subscriberMetadata || !isConfigured) {
			return;
		}

		log.info('Novu: Setting up client and WebSocket listeners', {
			context: { subscriberId },
		});

		// Initialize the Novu client (this creates the WebSocket connection)
		getNovuClient(subscriberId, subscriberMetadata);
		setIsConnected(true);

		// Subscribe to real-time events
		const unsubscribe = subscribeToNovuEvents({
			onNotificationReceived: (notification) => {
				log.info('Novu: New notification received via WebSocket!', {
					context: { id: notification.id, subject: notification.subject },
				});
				// Pass isNewNotification=true to trigger toast if payload.showToast is set
				syncNotificationToRxDB(notification, true);
			},
			onUnreadCountChanged: (count) => {
				log.debug('Novu: Unread count updated via WebSocket', { context: { count } });
				// The local RxDB query will update automatically when we sync
			},
		});

		// Initial fetch of notifications
		setIsLoading(true);
		fetchNotifications()
			.then((notifications) => {
				log.info('Novu: Initial notifications loaded', {
					context: { count: notifications.length },
				});
				return syncToRxDB(notifications);
			})
			.finally(() => {
				setIsLoading(false);
			});

		// Cleanup on unmount or subscriber change
		return () => {
			log.debug('Novu: Cleaning up WebSocket listeners');
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
				log.error('Novu: Failed to mark notification as read', { context: { error } });
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
			log.error('Novu: Failed to mark all notifications as read', { context: { error } });
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
			log.error('Novu: Failed to mark all notifications as seen', { context: { error } });
		}
	}, [notificationsCollection, subscriberId]);

	// Refresh notifications from Novu server
	const refresh = React.useCallback(async () => {
		if (!isConfigured) {
			log.warn('Novu: Not configured, skipping refresh');
			return;
		}

		setIsLoading(true);
		try {
			const novuNotifications = await fetchNotifications();
			await syncToRxDB(novuNotifications);
			log.info('Novu: Notifications refreshed', {
				context: { count: novuNotifications.length },
			});
		} catch (error) {
			log.error('Novu: Failed to refresh notifications', { context: { error } });
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
