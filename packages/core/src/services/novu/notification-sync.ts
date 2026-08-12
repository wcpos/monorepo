import type { NotificationCollection } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { getNotificationBehavior } from './notification-behaviors';

import type { NovuNotification } from './client';

const novuLogger = getLogger(['wcpos', 'notifications', 'novu']);

/**
 * Handle action URL - navigates to internal routes or opens external URLs
 */
function handleActionUrl(url: string): void {
	if (!url) return;

	// External URLs (http://, https://)
	if (url.startsWith('http://') || url.startsWith('https://')) {
		openExternalURL(url).catch((error) => {
			novuLogger.error('Novu: Failed to open external URL', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
				context: { url, error },
			});
		});
		return;
	}

	// Internal routes - TODO: integrate with navigation when needed
	// For now, just log - the app can implement navigation handling later
	novuLogger.info('Novu: Internal navigation requested', { context: { url } });
}

/**
 * Process notification based on workflow behavior configuration.
 *
 * Instead of reading behavior from notification.data (which Novu doesn't reliably pass),
 * we use client-side configuration keyed by workflow ID. This gives us full flexibility
 * without Novu's data field limitations.
 */
function processNotificationBehavior(
	notification: NovuNotification,
	isNewNotification: boolean
): void {
	// Only process behavior for NEW notifications (not on initial load/refresh)
	if (!isNewNotification) return;

	// Get workflow ID from notification.data (set in Novu workflow config)
	// WebSocket events don't include notification.workflow, so we use data.workflowId
	const data = notification.data as { workflowId?: string } | undefined;
	const workflowId = data?.workflowId;
	const severity = notification.severity as string | undefined;

	// Get behavior config for this workflow
	const behavior = getNotificationBehavior(workflowId, severity);

	const title = notification.subject || '';
	const body = notification.body || '';

	if (behavior.showToast) {
		const level = behavior.level || 'info';
		const options = {
			showToast: true,
			// Use body as context object so it's useful when saved to DB
			context: behavior.saveToDb && body ? { body } : undefined,
			toast: {
				text2:
					behavior.toast?.text2 || (behavior.toast?.useBodyAsText2 !== false ? body : undefined),
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
		};
		if (level === 'error') {
			novuLogger.error(title, { ...options, code: ERROR_CODES.UNEXPECTED_ERROR });
		} else {
			novuLogger[level](title, options);
		}
	} else if (behavior.saveToDb) {
		// Save to logs DB without showing toast
		novuLogger.info(title, {
			context: body ? { body } : undefined,
		});
	}
}

/**
 * Sync a single notification to RxDB (v3 API)
 *
 * @param collection - The local notifications collection
 * @param subscriberId - The Novu subscriber the notification belongs to
 * @param notification - The Novu notification object
 * @param isNewNotification - Whether this is a newly received notification (triggers behavior)
 */
export async function syncNotificationToRxDB(
	collection: NotificationCollection,
	subscriberId: string,
	notification: NovuNotification,
	isNewNotification = false,
	preserveLocalState = false
): Promise<void> {
	const notificationId = notification.id;
	if (!notificationId) {
		novuLogger.error('Novu: Notification missing ID', {
			code: ERROR_CODES.UNEXPECTED_ERROR,
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

		const nextNotification = {
			id: String(notificationId),
			subscriberId,
			title: notification.subject || '',
			body: notification.body || '',
			status: notification.isRead ? ('read' as const) : ('unread' as const),
			seen: notification.isSeen ?? false,
			createdAt: safeCreatedAt,
			workflowId,
			channel: notification.channelType || 'in_app',
		};

		if (preserveLocalState) {
			const existing = await collection.findOne(nextNotification.id).exec();
			if (existing) {
				await existing.incrementalModify((current) => ({
					...current,
					...nextNotification,
					status: current.status === 'unread' ? nextNotification.status : current.status,
					seen: current.seen || nextNotification.seen,
				}));
			} else {
				// A concurrent WebSocket insert wins any primary-key conflict instead of being
				// overwritten by this older snapshot.
				await collection.insert(nextNotification);
			}
		} else {
			await collection.upsert(nextNotification);
		}
		novuLogger.debug('Novu: Notification synced to RxDB', { context: { id: notificationId } });
	} catch (error) {
		novuLogger.error('Novu: Failed to sync notification to RxDB', {
			code: ERROR_CODES.UNEXPECTED_ERROR,
			context: { notificationId, error },
		});
	}
}

/**
 * Sync multiple notifications to RxDB (in parallel for performance).
 *
 * Used for initial load and refresh - these are NOT new notifications, so no toast.
 */
export async function syncNotificationsToRxDB(
	collection: NotificationCollection,
	subscriberId: string,
	notifications: NovuNotification[]
): Promise<void> {
	// Pass isNewNotification=false to avoid showing toasts for old notifications
	await Promise.all(
		notifications.map((notification) =>
			syncNotificationToRxDB(collection, subscriberId, notification, false, true)
		)
	);
}
