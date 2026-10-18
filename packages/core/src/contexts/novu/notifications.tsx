import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import {
	markAllNotificationsRead,
	markAllNotificationsSeen,
	markNotificationRead,
	type NotificationRow,
	observeNotifications,
} from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useNovu } from './config';
import { useAppState } from '../app-state';
import {
	novuBootstrapStatus$,
	refreshNovuNotifications,
	startNovuBootstrap,
	stopNovuBootstrap,
} from '../../services/novu/bootstrap';
import {
	markAllAsRead as novuMarkAllAsRead,
	markAllAsSeen as novuMarkAllAsSeen,
	markAsRead as novuMarkAsRead,
} from '../../services/novu/client';

const novuLogger = getLogger(['wcpos', 'notifications', 'novu']);

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
 * What the header bell needs: two counts and the seen action. Deliberately excludes the
 * notification list — the bell is mounted for the whole session, and publishing the list
 * alongside the counts re-rendered it on every notification body/seen/loading change even
 * when the number on the badge had not moved.
 */
export interface NovuNotificationsSummary {
	/** Number of unread notifications */
	unreadCount: number;
	/** Number of unseen notifications */
	unseenCount: number;
	/** Mark all notifications as seen (without marking as read) */
	markAllAsSeen: () => Promise<void>;
}

/** Everything else — the list itself and the actions that operate on it. */
export type NovuNotificationsList = Omit<
	UseNovuNotificationsResult,
	keyof NovuNotificationsSummary
>;

const NovuNotificationsSummaryContext = React.createContext<NovuNotificationsSummary | undefined>(
	undefined
);
const NovuNotificationsListContext = React.createContext<NovuNotificationsList | undefined>(
	undefined
);
/**
 * The combined view, published by the provider rather than composed per consumer so that
 * every `useNovuNotifications()` caller keeps sharing one object identity.
 */
const NovuNotificationsContext = React.createContext<UseNovuNotificationsResult | undefined>(
	undefined
);

const EMPTY_NOTIFICATIONS: Notification[] = [];

function toNotification(rows: NotificationRow[]): Notification[] {
	return rows.map((row) => ({
		id: row.id ?? '',
		title: row.title || '',
		body: row.body || '',
		status: row.status as 'unread' | 'read' | 'archived',
		seen: row.seen ?? false,
		createdAt: row.createdAt ?? 0,
		workflowId: row.workflowId ?? undefined,
	}));
}

interface NovuNotificationsProviderProps {
	children: React.ReactNode;
}

/**
 * NovuNotificationsProvider is the single owner of the Novu notification session.
 *
 * It owns the bootstrap (client init, WebSocket subscription, initial fetch, subscriber
 * metadata sync) and the single RxDB query that backs every consumer. Components read the
 * shared state through `useNovuNotifications()` - mounting or unmounting a consumer (the bell,
 * the panel inside its popover portal) never re-runs the bootstrap. See #911.
 */
export function NovuNotificationsProvider({ children }: NovuNotificationsProviderProps) {
	const { storeDB } = useAppState();
	const { subscriberId, subscriberMetadata, isConfigured } = useNovu();

	/**
	 * Drive the session from this one effect.
	 *
	 * The effect body is deliberately dependency-tolerant: `startNovuBootstrap` is keyed by
	 * `subscriberId` and is a no-op when the session is already running, so re-runs caused by
	 * unstable `subscriberMetadata`/`storeDB` identities (or StrictMode double-invocation) do
	 * not re-bootstrap. There is no cleanup function: the session outlives this effect's
	 * re-runs and is only torn down when the subscriber goes away (logout) or changes
	 * (store switch), which shows up here as a new dependency value.
	 */
	React.useEffect(() => {
		if (!subscriberId || !subscriberMetadata || !isConfigured || !storeDB) {
			stopNovuBootstrap();
			return;
		}

		startNovuBootstrap({ subscriberId, subscriberMetadata, database: storeDB });
	}, [subscriberId, subscriberMetadata, isConfigured, storeDB]);

	// Shared bootstrap status (one stream, every consumer reads the same values).
	// `useObservableEagerState`, not `useObservableState(status$, getNovuBootstrapStatus())`:
	// `useObservableState`'s second argument is the INITIAL state, read once on the first
	// render, so a getter there reads current state and then latches it (#1542, #1551 —
	// guarded by `wcpos/no-live-seed-in-observable-state`). `novuBootstrapStatus$` is a
	// BehaviorSubject's `asObservable()`, so the eager hook always gets its synchronous
	// value and there is nothing to seed.
	const status = useObservableEagerState(novuBootstrapStatus$);
	const isConnected = status.subscriberId === subscriberId && status.isConnected;

	// One named read for the whole app; it clears the old list before every binding.
	const notifications$ = React.useMemo(
		() => observeNotifications(storeDB, subscriberId).pipe(map(toNotification)),
		[storeDB, subscriberId]
	);
	const notifications = useObservableState(notifications$, EMPTY_NOTIFICATIONS);

	// Calculate counts from local data
	const unreadCount = React.useMemo(
		() => notifications.filter((n) => n.status === 'unread').length,
		[notifications]
	);

	const unseenCount = React.useMemo(
		() => notifications.filter((n) => !n.seen).length,
		[notifications]
	);

	// Mark a single notification as read (both Novu and RxDB)
	const markAsRead = React.useCallback(
		async (notificationId: string) => {
			if (!storeDB) return;

			try {
				// Update RxDB first for immediate UI feedback
				await markNotificationRead(storeDB, notificationId);

				// Then update Novu
				await novuMarkAsRead(notificationId);
			} catch (error) {
				novuLogger.error('Novu: Failed to mark notification as read', {
					code: ERROR_CODES.UNEXPECTED_ERROR,
					context: { error },
				});
			}
		},
		[storeDB]
	);

	// Mark all notifications as read (both Novu and RxDB)
	const markAllAsRead = React.useCallback(async () => {
		if (!storeDB || !subscriberId) return;

		try {
			// Update RxDB first
			await markAllNotificationsRead(storeDB, subscriberId);

			// Then update Novu
			await novuMarkAllAsRead();
		} catch (error) {
			novuLogger.error('Novu: Failed to mark all notifications as read', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
				context: { error },
			});
		}
	}, [storeDB, subscriberId]);

	// Mark all notifications as seen without marking as read (both Novu and RxDB)
	const markAllAsSeen = React.useCallback(async () => {
		if (!storeDB || !subscriberId) return;

		try {
			// Update RxDB first - only set seen: true, don't change status
			await markAllNotificationsSeen(storeDB, subscriberId);

			// Then update Novu
			await novuMarkAllAsSeen();
		} catch (error) {
			novuLogger.error('Novu: Failed to mark all notifications as seen', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
				context: { error },
			});
		}
	}, [storeDB, subscriberId]);

	// Refresh notifications from Novu server
	const refresh = React.useCallback(async () => {
		await refreshNovuNotifications();
	}, []);

	const summary = React.useMemo<NovuNotificationsSummary>(
		() => ({ unreadCount, unseenCount, markAllAsSeen }),
		[unreadCount, unseenCount, markAllAsSeen]
	);

	const list = React.useMemo<NovuNotificationsList>(
		() => ({
			notifications,
			isLoading: status.isLoading,
			isConnected,
			markAsRead,
			markAllAsRead,
			refresh,
		}),
		[notifications, status.isLoading, isConnected, markAsRead, markAllAsRead, refresh]
	);

	const combined = React.useMemo<UseNovuNotificationsResult>(
		() => ({ ...summary, ...list }),
		[summary, list]
	);

	return (
		<NovuNotificationsSummaryContext.Provider value={summary}>
			<NovuNotificationsListContext.Provider value={list}>
				<NovuNotificationsContext.Provider value={combined}>
					{children}
				</NovuNotificationsContext.Provider>
			</NovuNotificationsListContext.Provider>
		</NovuNotificationsSummaryContext.Provider>
	);
}

/**
 * The counts and the seen action only. Prefer this in anything that renders a badge — it
 * does not subscribe to the notification list, so a new notification body or a seen flag
 * cannot re-render it.
 */
export function useNovuNotificationsSummary(): NovuNotificationsSummary {
	const context = React.useContext(NovuNotificationsSummaryContext);
	if (!context) {
		throw new Error('useNovuNotificationsSummary must be used within a NovuProvider');
	}
	return context;
}

/**
 * Hook to read the shared Novu notification state.
 *
 * This is a thin subscription - all initialization is owned by `NovuNotificationsProvider`.
 *
 * Subscribes to BOTH halves, so it re-renders on any notification change. Reach for
 * `useNovuNotificationsSummary()` instead when all you need is a count.
 */
export function useNovuNotifications(): UseNovuNotificationsResult {
	const context = React.useContext(NovuNotificationsContext);
	if (!context) {
		throw new Error('useNovuNotifications must be used within a NovuProvider');
	}
	return context;
}
