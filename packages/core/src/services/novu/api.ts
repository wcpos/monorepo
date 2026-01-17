import log from '@wcpos/utils/logger';

import type { NovuSubscriberMetadata } from './subscriber';

/**
 * Novu API configuration
 */
const NOVU_API_URL = 'https://api.notifications.wcpos.com';
const NOVU_APP_ID = 'wcpos-notifications';

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
 * Novu session response
 */
interface SessionResponse {
	token: string;
	profile: {
		_id: string;
		subscriberId: string;
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
 * NovuApiClient handles all communication with the Novu API.
 *
 * Flow:
 * 1. Initialize session (identifies/creates subscriber, returns JWT token)
 * 2. Use token for subsequent API calls (fetch notifications, mark as read, etc.)
 */
export class NovuApiClient {
	private subscriberId: string;
	private metadata: NovuSubscriberMetadata;
	private sessionToken: string | null = null;

	constructor(subscriberId: string, metadata: NovuSubscriberMetadata) {
		this.subscriberId = subscriberId;
		this.metadata = metadata;
	}

	/**
	 * Initialize session with Novu.
	 * This identifies/creates the subscriber and returns a session token.
	 */
	async initializeSession(): Promise<boolean> {
		try {
			const response = await fetch(`${NOVU_API_URL}/v1/inbox/session`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					applicationIdentifier: NOVU_APP_ID,
					subscriberId: this.subscriberId,
					// Include subscriber data for creation/update
					firstName: this.metadata.domain,
					data: this.metadata,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				log.error('Failed to initialize Novu session', {
					context: { status: response.status, error: errorText },
				});
				return false;
			}

			const data: SessionResponse = await response.json();
			this.sessionToken = data.token;

			log.info('Novu session initialized', {
				context: { subscriberId: this.subscriberId },
			});

			return true;
		} catch (error) {
			log.error('Error initializing Novu session', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
			return false;
		}
	}

	/**
	 * Fetch notifications from Novu.
	 */
	async fetchNotifications(limit = 50): Promise<NovuNotification[]> {
		if (!this.sessionToken) {
			const initialized = await this.initializeSession();
			if (!initialized) {
				return [];
			}
		}

		try {
			const response = await fetch(
				`${NOVU_API_URL}/v1/inbox/notifications?limit=${limit}`,
				{
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${this.sessionToken}`,
					},
				}
			);

			if (!response.ok) {
				// Token might be expired, try to reinitialize
				if (response.status === 401) {
					this.sessionToken = null;
					const initialized = await this.initializeSession();
					if (initialized) {
						return this.fetchNotifications(limit);
					}
				}

				const errorText = await response.text();
				log.error('Failed to fetch Novu notifications', {
					context: { status: response.status, error: errorText },
				});
				return [];
			}

			const data: NotificationsFeedResponse = await response.json();
			return data.data || [];
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
		if (!this.sessionToken) {
			return false;
		}

		try {
			const response = await fetch(
				`${NOVU_API_URL}/v1/inbox/notifications/${notificationId}/read`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${this.sessionToken}`,
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
		if (!this.sessionToken) {
			return false;
		}

		try {
			const response = await fetch(`${NOVU_API_URL}/v1/inbox/notifications/read`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.sessionToken}`,
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
		if (!this.sessionToken) {
			return false;
		}

		try {
			const response = await fetch(
				`${NOVU_API_URL}/v1/inbox/notifications/${notificationId}/seen`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${this.sessionToken}`,
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
		if (!this.sessionToken) {
			return false;
		}

		try {
			const response = await fetch(`${NOVU_API_URL}/v1/inbox/notifications/seen`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.sessionToken}`,
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
		if (!this.sessionToken) {
			return 0;
		}

		try {
			const response = await fetch(`${NOVU_API_URL}/v1/inbox/notifications/count?read=false`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.sessionToken}`,
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
