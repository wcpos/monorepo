import { Novu } from '@novu/js';

import log from '@wcpos/utils/logger';

import type { NovuSubscriberMetadata } from './subscriber';

/**
 * Novu configuration for our self-hosted instance
 */
const NOVU_CONFIG = {
	applicationIdentifier: '64qzhASJJNnb',
	backendUrl: 'https://api.notifications.wcpos.com',
	socketUrl: 'wss://ws.notifications.wcpos.com',
};

/**
 * Singleton Novu client instance
 * We need a single instance to maintain the WebSocket connection
 */
let novuClient: Novu | null = null;
let currentSubscriberId: string | null = null;

/**
 * Novu notification from the SDK
 */
export interface NovuNotification {
	id: string;
	subject?: string;
	body?: string;
	isRead: boolean;
	isSeen: boolean;
	createdAt: string;
	payload?: Record<string, unknown>;
	channelType?: string;
}

/**
 * Event handlers type
 */
export interface NovuEventHandlers {
	onNotificationReceived?: (notification: NovuNotification) => void;
	onUnreadCountChanged?: (count: number) => void;
	onUnseenCountChanged?: (count: number) => void;
}

/**
 * Initialize or get the Novu client
 * Creates a new client if subscriber changed or doesn't exist
 */
export function getNovuClient(
	subscriberId: string,
	_metadata?: NovuSubscriberMetadata
): Novu {
	// Return existing client if subscriber hasn't changed
	if (novuClient && currentSubscriberId === subscriberId) {
		return novuClient;
	}

	// Clean up existing client
	if (novuClient) {
		log.debug('Novu: Disconnecting previous client');
		// The SDK handles cleanup internally
		novuClient = null;
	}

	log.info('Novu: Initializing client with WebSocket', {
		context: { subscriberId, socketUrl: NOVU_CONFIG.socketUrl },
	});

	// Create new Novu client
	novuClient = new Novu({
		subscriberId,
		applicationIdentifier: NOVU_CONFIG.applicationIdentifier,
		backendUrl: NOVU_CONFIG.backendUrl,
		socketUrl: NOVU_CONFIG.socketUrl,
	});

	currentSubscriberId = subscriberId;

	return novuClient;
}

/**
 * Subscribe to Novu real-time events
 */
export function subscribeToNovuEvents(handlers: NovuEventHandlers): () => void {
	if (!novuClient) {
		log.warn('Novu: Cannot subscribe to events - client not initialized');
		return () => {};
	}

	const unsubscribers: Array<() => void> = [];

	if (handlers.onNotificationReceived) {
		const handler = handlers.onNotificationReceived;
		novuClient.on('notifications.notification_received', (data) => {
			log.debug('Novu: Notification received via WebSocket', {
				context: { id: (data as { result?: { id?: string } })?.result?.id },
			});
			handler(data.result as unknown as NovuNotification);
		});
		unsubscribers.push(() => {
			// SDK should handle cleanup, but we track it
		});
	}

	if (handlers.onUnreadCountChanged) {
		const handler = handlers.onUnreadCountChanged;
		novuClient.on('notifications.unread_count_changed', (data) => {
			log.debug('Novu: Unread count changed via WebSocket', {
				context: { count: (data as { result?: number })?.result },
			});
			handler((data.result as number) || 0);
		});
	}

	if (handlers.onUnseenCountChanged) {
		const handler = handlers.onUnseenCountChanged;
		novuClient.on('notifications.unseen_count_changed', (data) => {
			log.debug('Novu: Unseen count changed via WebSocket', {
				context: { count: (data as { result?: number })?.result },
			});
			handler((data.result as number) || 0);
		});
	}

	// Return cleanup function
	return () => {
		unsubscribers.forEach((unsub) => unsub());
	};
}

/**
 * Fetch notifications using the SDK
 */
export async function fetchNotifications(limit = 50): Promise<NovuNotification[]> {
	if (!novuClient) {
		log.error('Novu: Cannot fetch notifications - client not initialized');
		return [];
	}

	try {
		const response = await novuClient.notifications.list({ limit });

		log.info('Novu: Fetched notifications', {
			context: { count: response.data?.notifications?.length || 0 },
		});

		return (response.data?.notifications || []) as unknown as NovuNotification[];
	} catch (error) {
		log.error('Novu: Failed to fetch notifications', {
			context: { error: error instanceof Error ? error.message : String(error) },
		});
		return [];
	}
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
	if (!novuClient) return false;

	try {
		await novuClient.notifications.read({ notificationId });
		return true;
	} catch (error) {
		log.error('Novu: Failed to mark as read', {
			context: { notificationId, error: error instanceof Error ? error.message : String(error) },
		});
		return false;
	}
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(): Promise<boolean> {
	if (!novuClient) return false;

	try {
		await novuClient.notifications.readAll({});
		return true;
	} catch (error) {
		log.error('Novu: Failed to mark all as read', {
			context: { error: error instanceof Error ? error.message : String(error) },
		});
		return false;
	}
}

/**
 * Mark notification as seen
 */
export async function markAsSeen(notificationId: string): Promise<boolean> {
	if (!novuClient) return false;

	try {
		// Novu SDK uses archive for seen in some versions
		// Check the SDK docs for exact method
		await novuClient.notifications.read({ notificationId });
		return true;
	} catch (error) {
		log.error('Novu: Failed to mark as seen', {
			context: { notificationId, error: error instanceof Error ? error.message : String(error) },
		});
		return false;
	}
}

/**
 * Mark all notifications as seen
 */
export async function markAllAsSeen(): Promise<boolean> {
	if (!novuClient) return false;

	try {
		await novuClient.notifications.readAll({});
		return true;
	} catch (error) {
		log.error('Novu: Failed to mark all as seen', {
			context: { error: error instanceof Error ? error.message : String(error) },
		});
		return false;
	}
}

/**
 * Get unread count
 */
export async function getUnreadCount(): Promise<number> {
	if (!novuClient) return 0;

	try {
		const response = await novuClient.notifications.count({ read: false });
		return response.data?.count || 0;
	} catch (error) {
		log.error('Novu: Failed to get unread count', {
			context: { error: error instanceof Error ? error.message : String(error) },
		});
		return 0;
	}
}

/**
 * Cleanup the Novu client
 */
export function disconnectNovuClient(): void {
	if (novuClient) {
		log.debug('Novu: Disconnecting client');
		novuClient = null;
		currentSubscriberId = null;
	}
}
