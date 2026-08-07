import { getLogger } from '@wcpos/utils/logger';

import { NOVU_CONFIG } from './config';

import type { Notification, Novu } from '@novu/js';
import type { NovuSubscriberMetadata } from './subscriber';

export { getNovuEnvironment } from './config';
export type { NovuEnvironment } from './config';
export type NovuNotification = Notification;

export interface NovuEventHandlers {
	onNotificationReceived?: (notification: NovuNotification) => void;
	onUnreadCountChanged?: (count: number) => void;
	onUnseenCountChanged?: (count: number) => void;
}

type NovuEvent =
	| { kind: 'notification_received'; notification: NovuNotification }
	| { kind: 'unread_count_changed'; count: number }
	| { kind: 'unseen_count_changed'; count: number }
	| { kind: 'session_ready' };
type NovuResponse<T> = { success: true; result: T } | { success: false; message: string };
interface NovuIpcRenderer {
	invoke(channel: 'novu', request: Record<string, unknown>): Promise<unknown>;
	on(channel: 'novu:event', listener: (event: NovuEvent) => void): () => void;
}
const novuLogger = getLogger(['wcpos', 'notifications', 'novu']);
const processedNotificationIds = new Set<string>();
const MAX_PROCESSED_IDS = 100;
let currentSubscriberId: string | null = null;
let novuClient: Novu | null = null;
let warnedMissingBridge = false;

function getIpcRenderer(): NovuIpcRenderer | null {
	const ipc =
		typeof window === 'undefined'
			? undefined
			: (window as unknown as { ipcRenderer?: NovuIpcRenderer }).ipcRenderer;
	if (!ipc && !warnedMissingBridge) {
		novuLogger.warn('Novu: Electron ipcRenderer is not available');
		warnedMissingBridge = true;
	}
	return ipc ?? null;
}

function logBridgeError(action: string, error: unknown): void {
	novuLogger.error(`Novu: Failed to ${action}`, {
		context: { error: error instanceof Error ? error.message : String(error) },
	});
}

async function invokeNovu<T>(request: Record<string, unknown>, fallback: T): Promise<T> {
	const ipc = getIpcRenderer();
	if (!ipc) return fallback;
	try {
		const response = (await ipc.invoke('novu', request)) as NovuResponse<T>;
		if (response.success) return response.result;
		logBridgeError(String(request.type), response.message);
	} catch (error) {
		logBridgeError(String(request.type), error);
	}
	return fallback;
}

export function getNovuClient(subscriberId: string, metadata?: NovuSubscriberMetadata): Novu {
	if (novuClient && currentSubscriberId === subscriberId) return novuClient;
	if (!getIpcRenderer()) return {} as Novu;

	// Consumers only use this nominal handle as an initialization signal; Electron owns the real client.
	novuClient = {} as Novu;
	currentSubscriberId = subscriberId;
	void invokeNovu(
		{
			type: 'init',
			subscriberId,
			locale: metadata?.locale,
			applicationIdentifier: NOVU_CONFIG.applicationIdentifier,
			apiUrl: NOVU_CONFIG.apiUrl,
			socketUrl: NOVU_CONFIG.socketUrl,
		},
		undefined
	);
	return novuClient;
}

export const waitForNovuReady = (timeoutMs = 5000): Promise<boolean> =>
	invokeNovu({ type: 'waitReady', timeoutMs }, false);
export const fetchNotifications = (limit = 50): Promise<NovuNotification[]> =>
	invokeNovu({ type: 'fetchNotifications', limit }, []);
export const markAsRead = (notificationId: string): Promise<boolean> =>
	invokeNovu({ type: 'markAsRead', notificationId }, false);
export const markAllAsRead = (): Promise<boolean> => invokeNovu({ type: 'markAllAsRead' }, false);
export const markAsSeen = (notificationId: string): Promise<boolean> =>
	invokeNovu({ type: 'markAsSeen', notificationId }, false);
export const markAllAsSeen = (): Promise<boolean> => invokeNovu({ type: 'markAllAsSeen' }, false);
export const getUnreadCount = (): Promise<number> => invokeNovu({ type: 'getUnreadCount' }, 0);
function isNewNotification(notificationId: string | undefined): boolean {
	if (!notificationId || processedNotificationIds.has(notificationId)) return false;
	processedNotificationIds.add(notificationId);
	if (processedNotificationIds.size > MAX_PROCESSED_IDS) {
		const firstId = processedNotificationIds.values().next().value;
		if (firstId) processedNotificationIds.delete(firstId);
	}
	return true;
}
export function subscribeToNovuEvents(handlers: NovuEventHandlers): () => void {
	const ipc = getIpcRenderer();
	if (!ipc) return () => {};
	return ipc.on('novu:event', (event) => {
		if (event.kind === 'notification_received') {
			if (isNewNotification(event.notification.id))
				handlers.onNotificationReceived?.(event.notification);
		} else if (event.kind === 'unread_count_changed') {
			handlers.onUnreadCountChanged?.(event.count);
		} else if (event.kind === 'unseen_count_changed') {
			handlers.onUnseenCountChanged?.(event.count);
		}
	});
}

export function disconnectNovuClient(): void {
	void invokeNovu({ type: 'disconnect' }, undefined);
	novuClient = null;
	currentSubscriberId = null;
}
