import { type Notification, Novu } from '@novu/js';

import log from '@wcpos/utils/logger';

import type { NovuSubscriberMetadata } from './subscriber';

/**
 * Novu Client - WebSocket connection and real-time notifications
 *
 * ## Architecture Overview
 *
 * The Novu integration has two parts that must be coordinated:
 *
 * 1. **Client-side (this file)**: Novu JS SDK creates WebSocket connection for real-time
 *    notifications. The SDK automatically creates/updates subscribers when initialized.
 *
 * 2. **Server-side (updates-server)**: Manages subscriber metadata and triggers workflows
 *    like welcome notifications. The server owns the subscriber `data` field including
 *    the `_welcomed` flag that prevents duplicate welcome messages.
 *
 * ## Critical Timing Requirement
 *
 * The Novu SDK establishes WebSocket connection ASYNCHRONOUSLY. If the server triggers
 * a notification before the WebSocket is connected, it will be missed.
 *
 * Solution: Use `waitForNovuReady()` before any server operation that triggers notifications.
 * This waits for the `session.initialize.resolved` event from the SDK.
 *
 * ## Why We Don't Pass `data` to the SDK
 *
 * The Novu JS SDK's subscriber config can accept a `data` field, but passing it will
 * OVERWRITE whatever the server has set (including `_welcomed: true`). The server-side
 * sync is the single source of truth for subscriber metadata.
 */

/**
 * Novu Application IDs for each environment
 * These are from our self-hosted Novu instance
 */
const NOVU_APP_IDS = {
	production: 'Wu5i9hEUNMO2',
	development: '64qzhASJJNnb',
} as const;

/**
 * Novu environment type - matches server-side definition
 */
export type NovuEnvironment = 'development' | 'production';

/**
 * Get the current Novu environment
 *
 * Auto-detects based on:
 * - __DEV__ for Expo/React Native
 * - NODE_ENV for Electron/Node
 *
 * Can be overridden with NOVU_ENV environment variable if needed.
 */
export function getNovuEnvironment(): NovuEnvironment {
	// Allow explicit override via env var (for edge cases)
	const override = process.env.EXPO_PUBLIC_NOVU_ENV || process.env.NOVU_ENV;
	if (override === 'development' || override === 'production') {
		return override;
	}

	// Auto-detect: __DEV__ is available in Expo/React Native
	if (typeof __DEV__ !== 'undefined') {
		return __DEV__ ? 'development' : 'production';
	}

	// Fallback for Electron/Node: check NODE_ENV
	return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}

/**
 * Novu configuration for our self-hosted instance
 *
 * Environment is auto-detected based on __DEV__ (Expo) or NODE_ENV (Electron).
 * No environment variables needed for normal workflow.
 */
const NOVU_CONFIG = {
	get applicationIdentifier() {
		return NOVU_APP_IDS[getNovuEnvironment()];
	},
	apiUrl:
		process.env.EXPO_PUBLIC_NOVU_API_URL ||
		process.env.NOVU_API_URL ||
		'https://api.notifications.wcpos.com',
	socketUrl:
		process.env.EXPO_PUBLIC_NOVU_SOCKET_URL ||
		process.env.NOVU_SOCKET_URL ||
		'wss://ws.notifications.wcpos.com',
};

/**
 * Singleton Novu client instance
 * We need a single instance to maintain the WebSocket connection
 */
let novuClient: Novu | null = null;
let currentSubscriberId: string | null = null;
let socketConnectedPromise: Promise<void> | null = null;
let socketConnectedResolve: (() => void) | null = null;
let sessionListenerUnsubscribe: (() => void) | null = null;

/**
 * Re-export the Notification type from @novu/js for use in other modules
 */
export type NovuNotification = Notification;

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
export function getNovuClient(subscriberId: string, metadata?: NovuSubscriberMetadata): Novu {
	// Return existing client if subscriber hasn't changed
	if (novuClient && currentSubscriberId === subscriberId) {
		return novuClient;
	}

	// Clean up existing client
	if (novuClient) {
		log.debug('Novu: Disconnecting previous client');
		// Clean up session listener before disconnecting
		if (sessionListenerUnsubscribe) {
			sessionListenerUnsubscribe();
			sessionListenerUnsubscribe = null;
		}
		// Disconnect the WebSocket before releasing the reference
		novuClient.socket.disconnect();
		novuClient = null;
	}

	log.info('Novu: Initializing client with WebSocket', {
		context: {
			subscriberId,
			applicationIdentifier: NOVU_CONFIG.applicationIdentifier,
			socketUrl: NOVU_CONFIG.socketUrl,
		},
	});

	// Log metadata at debug level to avoid exposing sensitive info like licenseKey
	log.debug('Novu: Subscriber metadata', { context: { metadata } });

	// Create new Novu client (v3 API)
	// Note: backendUrl is deprecated in v3, use apiUrl instead
	// IMPORTANT: Do NOT pass subscriber.data here - the server-side sync manages
	// subscriber metadata including the _welcomed flag. If we pass data here,
	// it overwrites the server's data and removes _welcomed.
	novuClient = new Novu({
		applicationIdentifier: NOVU_CONFIG.applicationIdentifier,
		apiUrl: NOVU_CONFIG.apiUrl,
		socketUrl: NOVU_CONFIG.socketUrl,
		subscriber: {
			subscriberId,
			locale: metadata?.locale,
			// Don't pass data - server sync handles all metadata
		},
	});

	// Set up session ready promise - Novu SDK uses session.initialize.resolved event
	socketConnectedPromise = new Promise<void>((resolve) => {
		socketConnectedResolve = resolve;
	});

	// Listen for session initialization event (this is when WebSocket is ready)
	// Capture the unsubscribe function for cleanup when subscriber changes
	sessionListenerUnsubscribe = novuClient.on('session.initialize.resolved', () => {
		log.debug('Novu: Session initialized (WebSocket ready)');
		if (socketConnectedResolve) {
			socketConnectedResolve();
			socketConnectedResolve = null;
		}
	});

	currentSubscriberId = subscriberId;

	return novuClient;
}

/**
 * Wait for Novu SDK to be fully initialized and ready to receive notifications.
 *
 * The Novu JS SDK establishes a WebSocket connection asynchronously. This function
 * waits for the `session.initialize.resolved` event which indicates the SDK is ready.
 *
 * IMPORTANT: Any operation that triggers server-side notifications (like welcome messages)
 * should wait for this before proceeding, otherwise the notification may be sent before
 * the WebSocket is connected and will be missed.
 *
 * @param timeoutMs - Maximum time to wait (default 5 seconds)
 * @returns true if ready, false if timeout
 */
export async function waitForNovuReady(timeoutMs = 5000): Promise<boolean> {
	if (!socketConnectedPromise) {
		log.warn('Novu: No socket connection promise - client not initialized');
		return false;
	}

	try {
		await Promise.race([
			socketConnectedPromise,
			new Promise<void>((_, reject) =>
				setTimeout(() => reject(new Error('Socket connection timeout')), timeoutMs)
			),
		]);
		return true;
	} catch {
		return false;
	}
}

// Global deduplication for WebSocket notifications
// Prevents duplicate events from being processed regardless of how many subscribers exist
const processedNotificationIds = new Set<string>();
const MAX_PROCESSED_IDS = 100;

function dedupeNotification(notificationId: string | undefined): boolean {
	if (!notificationId) return false;
	if (processedNotificationIds.has(notificationId)) {
		log.debug('Novu: Skipping duplicate WebSocket notification', {
			context: { id: notificationId },
		});
		return false; // Already processed
	}
	// Mark as processed
	processedNotificationIds.add(notificationId);
	// Keep set bounded
	if (processedNotificationIds.size > MAX_PROCESSED_IDS) {
		const firstId = processedNotificationIds.values().next().value;
		if (firstId) processedNotificationIds.delete(firstId);
	}
	return true; // New notification
}

/**
 * Subscribe to Novu real-time events
 */
export function subscribeToNovuEvents(handlers: NovuEventHandlers): () => void {
	if (!novuClient) {
		log.warn('Novu: Cannot subscribe to events - client not initialized');
		return () => {};
	}

	const unsubscribers: (() => void)[] = [];

	if (handlers.onNotificationReceived) {
		const handler = handlers.onNotificationReceived;
		// on() returns an unsubscribe function - capture it for proper cleanup
		const unsubscribe = novuClient.on('notifications.notification_received', (data) => {
			const notification = data.result as Record<string, unknown>;
			const notificationId = notification?.id as string | undefined;

			// Dedupe at source - only process each notification once globally
			if (!dedupeNotification(notificationId)) {
				return;
			}

			log.debug('Novu: WebSocket notification received', {
				context: {
					id: notificationId,
					dataValue: JSON.stringify(notification?.data),
				},
			});
			handler(notification as unknown as NovuNotification);
		});
		unsubscribers.push(unsubscribe);
	}

	if (handlers.onUnreadCountChanged) {
		const handler = handlers.onUnreadCountChanged;
		// on() returns an unsubscribe function - capture it for proper cleanup
		const unsubscribe = novuClient.on('notifications.unread_count_changed', (data) => {
			// v3 API returns { result: { total: number, severity: Record<string, number> } }
			const result = data.result as { total: number; severity: Record<string, number> };
			log.debug('Novu: Unread count changed via WebSocket', {
				context: { count: result?.total },
			});
			handler(result?.total || 0);
		});
		unsubscribers.push(unsubscribe);
	}

	if (handlers.onUnseenCountChanged) {
		const handler = handlers.onUnseenCountChanged;
		// on() returns an unsubscribe function - capture it for proper cleanup
		const unsubscribe = novuClient.on('notifications.unseen_count_changed', (data) => {
			log.debug('Novu: Unseen count changed via WebSocket', {
				context: { count: (data as { result?: number })?.result },
			});
			handler((data.result as number) || 0);
		});
		unsubscribers.push(unsubscribe);
	}

	// Return cleanup function
	return () => {
		unsubscribers.forEach((unsub) => unsub());
	};
}

/**
 * Fetch notifications using the SDK (v3 API)
 */
export async function fetchNotifications(limit = 50): Promise<NovuNotification[]> {
	if (!novuClient) {
		log.error('Novu: Cannot fetch notifications - client not initialized');
		return [];
	}

	try {
		const { data, error } = await novuClient.notifications.list({ limit });

		if (error) {
			log.error('Novu: Failed to fetch notifications', {
				context: { error: error.message },
			});
			return [];
		}

		log.info('Novu: Fetched notifications', {
			context: { count: data?.notifications?.length || 0 },
		});

		return data?.notifications || [];
	} catch (error) {
		log.error('Novu: Failed to fetch notifications', {
			context: { error: error instanceof Error ? error.message : String(error) },
		});
		return [];
	}
}

/**
 * Mark notification as read (v3 API)
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
	if (!novuClient) return false;

	try {
		const { error } = await novuClient.notifications.read({ notificationId });
		if (error) {
			log.error('Novu: Failed to mark as read', {
				context: { notificationId, error: error.message },
			});
			return false;
		}
		return true;
	} catch (error) {
		log.error('Novu: Failed to mark as read', {
			context: { notificationId, error: error instanceof Error ? error.message : String(error) },
		});
		return false;
	}
}

/**
 * Mark all notifications as read (v3 API)
 */
export async function markAllAsRead(): Promise<boolean> {
	if (!novuClient) return false;

	try {
		const { error } = await novuClient.notifications.readAll();
		if (error) {
			log.error('Novu: Failed to mark all as read', {
				context: { error: error.message },
			});
			return false;
		}
		return true;
	} catch (error) {
		log.error('Novu: Failed to mark all as read', {
			context: { error: error instanceof Error ? error.message : String(error) },
		});
		return false;
	}
}

/**
 * Mark notification as seen (v3 API)
 */
export async function markAsSeen(notificationId: string): Promise<boolean> {
	if (!novuClient) return false;

	try {
		const { error } = await novuClient.notifications.seen({ notificationId });
		if (error) {
			log.error('Novu: Failed to mark as seen', {
				context: { notificationId, error: error.message },
			});
			return false;
		}
		return true;
	} catch (error) {
		log.error('Novu: Failed to mark as seen', {
			context: { notificationId, error: error instanceof Error ? error.message : String(error) },
		});
		return false;
	}
}

/**
 * Mark all notifications as seen (v3 API)
 */
export async function markAllAsSeen(): Promise<boolean> {
	if (!novuClient) return false;

	try {
		const { error } = await novuClient.notifications.seenAll();
		if (error) {
			log.error('Novu: Failed to mark all as seen', {
				context: { error: error.message },
			});
			return false;
		}
		return true;
	} catch (error) {
		log.error('Novu: Failed to mark all as seen', {
			context: { error: error instanceof Error ? error.message : String(error) },
		});
		return false;
	}
}

/**
 * Get unread count (v3 API)
 */
export async function getUnreadCount(): Promise<number> {
	if (!novuClient) return 0;

	try {
		const { data, error } = await novuClient.notifications.count({ read: false });
		if (error) {
			log.error('Novu: Failed to get unread count', {
				context: { error: error.message },
			});
			return 0;
		}
		return data?.count || 0;
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
		// Clean up session listener before disconnecting
		if (sessionListenerUnsubscribe) {
			sessionListenerUnsubscribe();
			sessionListenerUnsubscribe = null;
		}
		// Disconnect the WebSocket before releasing the reference
		novuClient.socket.disconnect();
		novuClient = null;
		currentSubscriberId = null;
	}
}
