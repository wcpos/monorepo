import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Badge } from '@wcpos/components/badge';
import { Icon } from '@wcpos/components/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';

import { useNovuNotifications } from '../../../../hooks/use-novu-notifications';
import { NotificationPanelContent } from './notification-panel';

/**
 * NotificationBell component displays a bell icon with an unread count badge.
 * Clicking the bell opens a notification popover.
 */
export function NotificationBell() {
	const { unreadCount, markAllAsSeen } = useNovuNotifications();
	const [isOpen, setIsOpen] = React.useState(false);

	const handleOpenChange = (open: boolean) => {
		setIsOpen(open);
		if (open) {
			markAllAsSeen();
		}
	};

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Pressable
					className="relative px-2"
					accessibilityRole="button"
					accessibilityLabel="Notifications"
				>
					<Icon name="bell" className="text-sidebar-foreground" />
					{unreadCount > 0 && (
						<View className="absolute -top-1 -right-0.5">
							<Badge count={unreadCount} max={99} variant="destructive" size="sm" />
						</View>
					)}
				</Pressable>
			</PopoverTrigger>
			<PopoverContent side="bottom" align="center" className="flex max-h-96 w-80 flex-col p-0">
				<NotificationPanelContent />
			</PopoverContent>
		</Popover>
	);
}
