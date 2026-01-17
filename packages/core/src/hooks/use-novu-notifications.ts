import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import log from '@wcpos/utils/logger';

import { useAppState } from '../contexts/app-state';
import { useNovu } from '../contexts/novu';
import { NovuApiClient, type NovuNotification } from '../services/novu/api';

import type { NotificationCollection } from '@wcpos/database';

export interface Notification {
	id: string;
	title: string;
	body: string;
	status: 'unread' | 'read' | 'archived';
	seen: boolean;
	createdAt: number;
	payload?: Record<string, unknown>;
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
	/** Whether the Novu session is initialized */
	isInitialized: boolean;
	/** Mark a notification as read */
	markAsRead: (notificationId: string) => Promise<void>;
	/** Mark all notifications as read */
	markAllAsRead: () => Promise<void>;
	/** Mark a notification as seen */
	markAsSeen: (notificationId: string) => Promise<void>;
	/** Mark all notifications as seen */
	markAllAsSeen: () => Promise<void>;
	/** Refresh notifications from server */
	refresh: () => Promise<void>;
}

/**
 * Hook to manage Novu notifications with local RxDB storage.
 *
 * This hook:
 * - Initializes Novu session on mount (registers/identifies subscriber)
 * - Fetches notifications from Novu API
 * - Syncs notifications to local RxDB for offline access
 * - Provides methods to mark as read/seen (updates both Novu and RxDB)
 */
export function useNovuNotifications(): UseNovuNotificationsResult {
	const { storeDB } = useAppState();
	const { subscriberId, subscriberMetadata, isConfigured } = useNovu();
	const [isLoading, setIsLoading] = React.useState(false);
	const [isInitialized, setIsInitialized] = React.useState(false);

	// Create Novu API client
	const apiClient = React.useMemo(() => {
		if (!subscriberId || !subscriberMetadata) {
			return null;
		}
		return new NovuApiClient(subscriberId, subscriberMetadata);
	}, [subscriberId, subscriberMetadata]);

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

	// Calculate counts
	const unreadCount = React.useMemo(
		() => notifications.filter((n) => n.status === 'unread').length,
		[notifications]
	);

	const unseenCount = React.useMemo(
		() => notifications.filter((n) => !n.seen).length,
		[notifications]
	);

	/**
	 * Sync notifications from Novu to RxDB
	 */
	const syncToRxDB = React.useCallback(
		async (novuNotifications: NovuNotification[]) => {
			if (!notificationsCollection || !subscriberId) return;

			for (const notification of novuNotifications) {
				try {
					// Upsert notification to RxDB
					await notificationsCollection.upsert({
						id: notification._id,
						subscriberId,
						title: notification.subject || '',
						body: notification.body || '',
						status: notification.read ? 'read' : 'unread',
						seen: notification.seen,
						createdAt: new Date(notification.createdAt).getTime(),
						payload: notification.payload,
						channel: notification.channel || 'in_app',
					});
				} catch (error) {
					log.error('Failed to sync notification to RxDB', {
						context: { notificationId: notification._id, error },
					});
				}
			}
		},
		[notificationsCollection, subscriberId]
	);

	/**
	 * Initialize Novu session and fetch notifications
	 */
	const initialize = React.useCallback(async () => {
		if (!apiClient || !isConfigured) {
			return;
		}

		setIsLoading(true);
		try {
			// Initialize session (creates/updates subscriber)
			const success = await apiClient.initializeSession();
			if (success) {
				setIsInitialized(true);

				// Fetch and sync notifications
				const novuNotifications = await apiClient.fetchNotifications();
				await syncToRxDB(novuNotifications);

				log.info('Novu notifications initialized', {
					context: { count: novuNotifications.length },
				});
			}
		} catch (error) {
			log.error('Failed to initialize Novu notifications', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
		} finally {
			setIsLoading(false);
		}
	}, [apiClient, isConfigured, syncToRxDB]);

	// Initialize on mount
	React.useEffect(() => {
		if (apiClient && isConfigured && !isInitialized) {
			initialize();
		}
	}, [apiClient, isConfigured, isInitialized, initialize]);

	// Mark a single notification as read (both Novu and RxDB)
	const markAsRead = React.useCallback(
		async (notificationId: string) => {
			if (!notificationsCollection) return;

			try {
				// Update Novu
				if (apiClient) {
					await apiClient.markAsRead(notificationId);
				}

				// Update RxDB
				const doc = await notificationsCollection.findOne(notificationId).exec();
				if (doc) {
					await doc.patch({ status: 'read', seen: true });
				}
			} catch (error) {
				log.error('Failed to mark notification as read', { context: { error } });
			}
		},
		[notificationsCollection, apiClient]
	);

	// Mark all notifications as read (both Novu and RxDB)
	const markAllAsRead = React.useCallback(async () => {
		if (!notificationsCollection || !subscriberId) return;

		try {
			// Update Novu
			if (apiClient) {
				await apiClient.markAllAsRead();
			}

			// Update RxDB
			const unreadDocs = await notificationsCollection
				.find({
					selector: {
						subscriberId,
						status: 'unread',
					},
				})
				.exec();

			await Promise.all(unreadDocs.map((doc) => doc.patch({ status: 'read', seen: true })));
		} catch (error) {
			log.error('Failed to mark all notifications as read', { context: { error } });
		}
	}, [notificationsCollection, subscriberId, apiClient]);

	// Mark a single notification as seen (both Novu and RxDB)
	const markAsSeen = React.useCallback(
		async (notificationId: string) => {
			if (!notificationsCollection) return;

			try {
				// Update Novu
				if (apiClient) {
					await apiClient.markAsSeen(notificationId);
				}

				// Update RxDB
				const doc = await notificationsCollection.findOne(notificationId).exec();
				if (doc && !doc.seen) {
					await doc.patch({ seen: true });
				}
			} catch (error) {
				log.error('Failed to mark notification as seen', { context: { error } });
			}
		},
		[notificationsCollection, apiClient]
	);

	// Mark all notifications as seen (both Novu and RxDB)
	const markAllAsSeen = React.useCallback(async () => {
		if (!notificationsCollection || !subscriberId) return;

		try {
			// Update Novu
			if (apiClient) {
				await apiClient.markAllAsSeen();
			}

			// Update RxDB
			const unseenDocs = await notificationsCollection
				.find({
					selector: {
						subscriberId,
						seen: false,
					},
				})
				.exec();

			await Promise.all(unseenDocs.map((doc) => doc.patch({ seen: true })));
		} catch (error) {
			log.error('Failed to mark all notifications as seen', { context: { error } });
		}
	}, [notificationsCollection, subscriberId, apiClient]);

	// Refresh notifications from Novu server
	const refresh = React.useCallback(async () => {
		if (!apiClient || !isConfigured) {
			log.warn('Novu not configured, skipping refresh');
			return;
		}

		setIsLoading(true);
		try {
			const novuNotifications = await apiClient.fetchNotifications();
			await syncToRxDB(novuNotifications);
			log.info('Novu notifications refreshed', {
				context: { count: novuNotifications.length },
			});
		} catch (error) {
			log.error('Failed to refresh notifications', { context: { error } });
		} finally {
			setIsLoading(false);
		}
	}, [apiClient, isConfigured, syncToRxDB]);

	return {
		notifications,
		unreadCount,
		unseenCount,
		isLoading,
		isInitialized,
		markAsRead,
		markAllAsRead,
		markAsSeen,
		markAllAsSeen,
		refresh,
	};
}
