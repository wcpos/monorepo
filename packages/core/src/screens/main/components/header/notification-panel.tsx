import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { formatDistanceToNow } from 'date-fns';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { useNovuNotifications, type Notification } from '../../../../hooks/use-novu-notifications';

interface NotificationPanelProps {
	isOpen: boolean;
	onClose: () => void;
}

interface NotificationItemProps {
	notification: Notification;
	onMarkAsRead: (id: string) => void;
}

/**
 * Individual notification item
 */
function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
	const isUnread = notification.status === 'unread';

	const timeAgo = React.useMemo(() => {
		if (!notification.createdAt) return '';
		return formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });
	}, [notification.createdAt]);

	const handlePress = React.useCallback(() => {
		if (isUnread) {
			onMarkAsRead(notification.id);
		}
	}, [isUnread, notification.id, onMarkAsRead]);

	return (
		<Pressable
			onPress={handlePress}
			className={`rounded-md p-3 ${isUnread ? 'bg-accent/50' : 'bg-transparent'}`}
		>
			<HStack className="items-start gap-3">
				{/* Unread indicator */}
				<View className="pt-1.5">
					{isUnread ? (
						<View className="h-2 w-2 rounded-full bg-primary" />
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
					{timeAgo && (
						<Text className="text-muted-foreground text-xs">{timeAgo}</Text>
					)}
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
			<Text className="text-muted-foreground mt-2">
				{t('No notifications', { _tags: 'core' })}
			</Text>
		</VStack>
	);
}

/**
 * NotificationPanel displays a list of notifications in a modal/popover.
 */
export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
	const t = useT();
	const {
		notifications,
		unreadCount,
		markAsRead,
		markAllAsRead,
		markAllAsSeen,
	} = useNovuNotifications();

	// Mark all as seen when panel opens
	React.useEffect(() => {
		if (isOpen) {
			markAllAsSeen();
		}
	}, [isOpen, markAllAsSeen]);

	const handleMarkAllAsRead = React.useCallback(() => {
		markAllAsRead();
	}, [markAllAsRead]);

	// Don't render if not open
	if (!isOpen) {
		return null;
	}

	return (
		<Modal onClose={onClose}>
			<ModalContent size="sm">
				<ModalHeader>
					<HStack className="flex-1 items-center justify-between">
						<ModalTitle>{t('Notifications', { _tags: 'core' })}</ModalTitle>
						{unreadCount > 0 && (
							<Button variant="ghost" size="sm" onPress={handleMarkAllAsRead}>
								<ButtonText className="text-xs">
									{t('Mark all as read', { _tags: 'core' })}
								</ButtonText>
							</Button>
						)}
					</HStack>
				</ModalHeader>

				<ModalBody>
					{notifications.length === 0 ? (
						<EmptyState />
					) : (
						<ScrollView className="max-h-80">
							<VStack className="gap-1">
								{notifications.map((notification) => (
									<NotificationItem
										key={notification.id}
										notification={notification}
										onMarkAsRead={markAsRead}
									/>
								))}
							</VStack>
						</ScrollView>
					)}
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}
