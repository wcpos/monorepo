import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { type Notification, useNovuNotifications } from '../../../../hooks/use-novu-notifications';
import { useDateFormat } from '../../hooks/use-date-format';

/** Estimated height of a notification item in pixels (includes padding, title, body, timestamp) */
const ESTIMATED_ITEM_SIZE = 88;

interface NotificationItemProps {
	notification: Notification;
	onMarkAsRead: (id: string) => void;
}

/**
 * Individual notification item
 */
function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
	const isUnread = notification.status === 'unread';
	// Use the i18n-aware date format hook (handles locale and auto-updates)
	const timeAgo = useDateFormat(String(notification.createdAt ?? ''));

	const handlePress = React.useCallback(() => {
		if (isUnread) {
			onMarkAsRead(notification.id);
		}
	}, [isUnread, notification.id, onMarkAsRead]);

	return (
		<Pressable
			onPress={handlePress}
			className={`mb-2 rounded-md px-2 py-1.5 ${isUnread ? 'bg-accent/50' : 'bg-transparent'}`}
		>
			<HStack className="items-start gap-3">
				{/* Unread indicator */}
				<View className="pt-1.5">
					{isUnread ? (
						<View className="bg-primary h-2 w-2 rounded-full" />
					) : (
						<View className="h-2 w-2" />
					)}
				</View>

				{/* Content */}
				<VStack className="flex-1 gap-1">
					<Text className={`text-sm ${isUnread ? 'font-semibold' : 'font-normal'}`}>
						{notification.title}
					</Text>
					{notification.body && (
						<Text className="text-muted-foreground text-xs">{notification.body}</Text>
					)}
					{timeAgo && <Text className="text-muted-foreground/60 text-xs">{timeAgo}</Text>}
				</VStack>
			</HStack>
		</Pressable>
	);
}

/**
 * Empty state when no notifications
 */
function EmptyState() {
	const t = useT();

	return (
		<VStack className="items-center justify-center py-8">
			<Icon name="bell" size="2xl" variant="muted" />
			<Text className="text-muted-foreground mt-2">{t('common.no_notifications')}</Text>
		</VStack>
	);
}

/**
 * NotificationPanelContent displays a list of notifications inside a popover.
 */
export function NotificationPanelContent() {
	const t = useT();
	const { notifications, unreadCount, markAsRead, markAllAsRead } = useNovuNotifications();

	const handleMarkAllAsRead = React.useCallback(() => {
		markAllAsRead();
	}, [markAllAsRead]);

	const renderNotificationItem = React.useCallback(
		({ item }: { item: Notification }) => (
			<VirtualizedList.Item>
				<NotificationItem notification={item} onMarkAsRead={markAsRead} />
			</VirtualizedList.Item>
		),
		[markAsRead]
	);

	return (
		<>
			{/* Header */}
			<HStack className="border-border items-center justify-between border-b px-3 py-2">
				<Text className="text-sm font-semibold">{t('common.notifications')}</Text>
				{unreadCount > 0 && (
					<Button variant="ghost" size="sm" onPress={handleMarkAllAsRead}>
						<ButtonText className="text-xs">{t('common.mark_all_as_read')}</ButtonText>
					</Button>
				)}
			</HStack>

			{/* Content */}
			{notifications.length === 0 ? (
				<EmptyState />
			) : (
				<VirtualizedList.Root className="flex-1 p-2">
					<VirtualizedList.List
						data={notifications}
						estimatedItemSize={ESTIMATED_ITEM_SIZE}
						keyExtractor={(item: Notification) => item.id}
						renderItem={renderNotificationItem}
						parentProps={{ style: { flexGrow: 1, flexShrink: 1, flexBasis: 0 } }}
					/>
				</VirtualizedList.Root>
			)}
		</>
	);
}
