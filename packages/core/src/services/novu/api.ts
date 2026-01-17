import log from '@wcpos/utils/logger';

import type { NovuSubscriberMetadata } from './subscriber';

/**
 * Novu API configuration
 */
const NOVU_API_URL = 'https://api.notifications.wcpos.com';
const NOVU_APP_ID = '64qzhASJJNnb';

/**
 * Novu notification from API response
 */
export interface NovuNotification {
	_id: string;
	subject?: string;
	body?: string;
	read: boolean;
	seen: boolean;
	createdAt: string;
	payload?: Record<string, unknown>;
	channel?: string;
}

/**
 * Novu session response - wrapped in data object
 */
interface SessionResponse {
	data: {
		token: string;
		totalUnreadCount?: number;
		removeNovuBranding?: boolean;
		applicationIdentifier?: string;
	};
}

/**
 * Novu notifications feed response
 */
interface NotificationsFeedResponse {
	data: NovuNotification[];
	totalCount: number;
	hasMore: boolean;
	page: number;
	pageSize: number;
}

/**
 * Session token cache - persists across NovuApiClient instances
 * Key: subscriberId, Value: { token, expiresAt }
 */
const sessionCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * NovuApiClient handles all communication with the Novu API.
 *
 * Flow:
 * 1. Initialize session (identifies/creates subscriber, returns JWT token)
 * 2. Use token for subsequent API calls (fetch notifications, mark as read, etc.)
 *
 * Session tokens are cached globally to survive component re-renders.
 */
export class NovuApiClient {
	private subscriberId: string;
	private metadata: NovuSubscriberMetadata;
	private isInitializing = false;

	constructor(subscriberId: string, metadata: NovuSubscriberMetadata) {
		this.subscriberId = subscriberId;
		this.metadata = metadata;
	}

	/**
	 * Get cached session token if valid
	 */
	private getCachedToken(): string | null {
		const cached = sessionCache.get(this.subscriberId);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.token;
		}
		return null;
	}

	/**
	 * Cache session token (expires in 1 hour to be safe, Novu tokens usually last longer)
	 */
	private setCachedToken(token: string): void {
		sessionCache.set(this.subscriberId, {
			token,
			expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
		});
	}

	/**
	 * Clear cached token
	 */
	private clearCachedToken(): void {
		sessionCache.delete(this.subscriberId);
	}

	/**
	 * Initialize session with Novu.
	 * This identifies/creates the subscriber and returns a session token.
	 *
	 * Uses caching and prevents concurrent initialization calls.
	 */
	async initializeSession(): Promise<boolean> {
		// Check cache first
		const cachedToken = this.getCachedToken();
		if (cachedToken) {
			log.debug('Using cached Novu session token');
			return true;
		}

		// Prevent concurrent initialization
		if (this.isInitializing) {
			log.debug('Novu session initialization already in progress');
			return false;
		}

		this.isInitializing = true;

		try {
			const requestBody = {
				applicationIdentifier: NOVU_APP_ID,
				subscriberId: this.subscriberId,
				// Include subscriber data for creation/update
				firstName: this.metadata.domain,
				data: this.metadata,
			};

			log.debug('Novu session request', {
				context: { url: `${NOVU_API_URL}/v1/inbox/session`, body: requestBody },
			});

			const response = await fetch(`${NOVU_API_URL}/v1/inbox/session`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
			});

			const responseText = await response.text();
			log.debug('Novu session response', {
				context: { status: response.status, body: responseText.substring(0, 500) },
			});

			if (!response.ok) {
				log.error('Failed to initialize Novu session', {
					context: { status: response.status, error: responseText },
				});
				return false;
			}

			const data: SessionResponse = JSON.parse(responseText);
			const token = data.data?.token;

			log.debug('Novu session token received', {
				context: {
					tokenLength: token?.length,
					tokenPrefix: token?.substring(0, 20),
					totalUnreadCount: data.data?.totalUnreadCount,
				},
			});

			if (!token) {
				log.error('Novu session response missing token', { context: { data } });
				return false;
			}

			this.setCachedToken(token);

			log.info('Novu session initialized', {
				context: { subscriberId: this.subscriberId },
			});

			return true;
		} catch (error) {
			log.error('Error initializing Novu session', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
			return false;
		} finally {
			this.isInitializing = false;
		}
	}

	/**
	 * Fetch notifications from Novu.
	 */
	async fetchNotifications(limit = 50, retryCount = 0): Promise<NovuNotification[]> {
		log.debug('fetchNotifications called', { context: { retryCount, limit } });

		const token = this.getCachedToken();
		if (!token) {
			log.debug('No cached token, initializing session');
			const initialized = await this.initializeSession();
			if (!initialized) {
				log.error('Session initialization failed, cannot fetch notifications');
				return [];
			}
		}

		const currentToken = this.getCachedToken();
		if (!currentToken) {
			log.error('No Novu session token available after initialization');
			return [];
		}

		log.debug('Fetching notifications with token', {
			context: { tokenPrefix: currentToken.substring(0, 20), tokenLength: currentToken.length },
		});

		try {
			const url = `${NOVU_API_URL}/v1/inbox/notifications?limit=${limit}`;
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${currentToken}`,
				},
			});

			const responseText = await response.text();
			log.debug('Fetch notifications response', {
				context: {
					status: response.status,
					bodyLength: responseText.length,
					bodyPreview: responseText.substring(0, 300),
				},
			});

			if (!response.ok) {
				// Token might be expired, try to reinitialize (max 1 retry)
				if (response.status === 401 && retryCount < 1) {
					log.debug('Got 401, clearing token and retrying');
					this.clearCachedToken();
					const initialized = await this.initializeSession();
					if (initialized) {
						return this.fetchNotifications(limit, retryCount + 1);
					}
				}

				log.error('Failed to fetch Novu notifications', {
					context: { status: response.status, error: responseText },
				});
				return [];
			}

			const rawData = JSON.parse(responseText);
			log.debug('Novu notifications raw response structure', {
				context: { keys: Object.keys(rawData), hasData: 'data' in rawData },
			});

			// Novu Inbox API wraps response in { data: { notifications: [...] } } or { data: [...] }
			let notifications: NovuNotification[] = [];
			if (Array.isArray(rawData.data)) {
				notifications = rawData.data;
			} else if (rawData.data?.notifications && Array.isArray(rawData.data.notifications)) {
				notifications = rawData.data.notifications;
			} else if (rawData.notifications && Array.isArray(rawData.notifications)) {
				notifications = rawData.notifications;
			}

			log.info('Novu fetched notifications successfully', {
				context: {
					count: notifications.length,
					firstNotificationKeys: notifications[0] ? Object.keys(notifications[0]) : [],
				},
			});
			return notifications;
		} catch (error) {
			log.error('Error fetching Novu notifications', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
			return [];
		}
	}

	/**
	 * Mark a notification as read.
	 */
	async markAsRead(notificationId: string): Promise<boolean> {
		const token = this.getCachedToken();
		if (!token) {
			return false;
		}

		try {
			const response = await fetch(
				`${NOVU_API_URL}/v1/inbox/notifications/${notificationId}/read`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
				}
			);

			return response.ok;
		} catch (error) {
			log.error('Error marking notification as read', {
				context: { notificationId, error: error instanceof Error ? error.message : String(error) },
			});
			return false;
		}
	}

	/**
	 * Mark all notifications as read.
	 */
	async markAllAsRead(): Promise<boolean> {
		const token = this.getCachedToken();
		if (!token) {
			return false;
		}

		try {
			const response = await fetch(`${NOVU_API_URL}/v1/inbox/notifications/read`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
			});

			return response.ok;
		} catch (error) {
			log.error('Error marking all notifications as read', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
			return false;
		}
	}

	/**
	 * Mark a notification as seen.
	 */
	async markAsSeen(notificationId: string): Promise<boolean> {
		const token = this.getCachedToken();
		if (!token) {
			return false;
		}

		try {
			const response = await fetch(
				`${NOVU_API_URL}/v1/inbox/notifications/${notificationId}/seen`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
				}
			);

			return response.ok;
		} catch (error) {
			log.error('Error marking notification as seen', {
				context: { notificationId, error: error instanceof Error ? error.message : String(error) },
			});
			return false;
		}
	}

	/**
	 * Mark all notifications as seen.
	 */
	async markAllAsSeen(): Promise<boolean> {
		const token = this.getCachedToken();
		if (!token) {
			return false;
		}

		try {
			const response = await fetch(`${NOVU_API_URL}/v1/inbox/notifications/seen`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
			});

			return response.ok;
		} catch (error) {
			log.error('Error marking all notifications as seen', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
			return false;
		}
	}

	/**
	 * Get unread count.
	 */
	async getUnreadCount(): Promise<number> {
		const token = this.getCachedToken();
		if (!token) {
			return 0;
		}

		try {
			const response = await fetch(`${NOVU_API_URL}/v1/inbox/notifications/count?read=false`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				return 0;
			}

			const data = await response.json();
			return data.count || 0;
		} catch (error) {
			log.error('Error getting unread count', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
			return 0;
		}
	}
}
