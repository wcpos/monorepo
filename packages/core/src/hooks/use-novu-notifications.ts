import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import log from '@wcpos/utils/logger';

import { useAppState } from '../contexts/app-state';
import { useNovu } from '../contexts/novu';

import type { NotificationDocument, NotificationCollection } from '@wcpos/database';

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
 * - Reads notifications from the local RxDB store
 * - Provides counts for unread/unseen notifications
 * - Allows marking notifications as read/seen
 * - Can sync with Novu server (when implemented)
 */
export function useNovuNotifications(): UseNovuNotificationsResult {
	const { storeDB } = useAppState();
	const { subscriberId, isConfigured } = useNovu();
	const [isLoading, setIsLoading] = React.useState(false);

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

	// Mark a single notification as read
	const markAsRead = React.useCallback(
		async (notificationId: string) => {
			if (!notificationsCollection) return;

			try {
				const doc = await notificationsCollection.findOne(notificationId).exec();
				if (doc) {
					await doc.patch({ status: 'read', seen: true });
				}
			} catch (error) {
				log.error('Failed to mark notification as read', { context: { error } });
			}
		},
		[notificationsCollection]
	);

	// Mark all notifications as read
	const markAllAsRead = React.useCallback(async () => {
		if (!notificationsCollection || !subscriberId) return;

		try {
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
	}, [notificationsCollection, subscriberId]);

	// Mark a single notification as seen
	const markAsSeen = React.useCallback(
		async (notificationId: string) => {
			if (!notificationsCollection) return;

			try {
				const doc = await notificationsCollection.findOne(notificationId).exec();
				if (doc && !doc.seen) {
					await doc.patch({ seen: true });
				}
			} catch (error) {
				log.error('Failed to mark notification as seen', { context: { error } });
			}
		},
		[notificationsCollection]
	);

	// Mark all notifications as seen
	const markAllAsSeen = React.useCallback(async () => {
		if (!notificationsCollection || !subscriberId) return;

		try {
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
	}, [notificationsCollection, subscriberId]);

	// Refresh notifications from Novu server
	// TODO: Implement actual Novu API call when SDK is integrated
	const refresh = React.useCallback(async () => {
		if (!isConfigured || !subscriberId) {
			log.warn('Novu not configured, skipping refresh');
			return;
		}

		setIsLoading(true);
		try {
			// TODO: Fetch from Novu API and sync to RxDB
			// const response = await fetch(`${config.backendUrl}/v1/subscribers/${subscriberId}/notifications/feed`);
			// const data = await response.json();
			// Sync to RxDB...
			log.info('Novu notifications refresh - not yet implemented');
		} catch (error) {
			log.error('Failed to refresh notifications', { context: { error } });
		} finally {
			setIsLoading(false);
		}
	}, [isConfigured, subscriberId]);

	return {
		notifications,
		unreadCount,
		unseenCount,
		isLoading,
		markAsRead,
		markAllAsRead,
		markAsSeen,
		markAllAsSeen,
		refresh,
	};
}
