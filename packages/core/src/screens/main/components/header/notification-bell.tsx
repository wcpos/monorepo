import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Badge } from '@wcpos/components/badge';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../../contexts/translations';
import { useNovuNotifications } from '../../../../hooks/use-novu-notifications';
import { NotificationPanel } from './notification-panel';

/**
 * NotificationBell component displays a bell icon with an unread count badge.
 * Clicking the bell opens a notification panel.
 */
export function NotificationBell() {
	const t = useT();
	const { unreadCount, unseenCount } = useNovuNotifications();
	const [isPanelOpen, setIsPanelOpen] = React.useState(false);

	const handlePress = React.useCallback(() => {
		setIsPanelOpen((prev) => !prev);
	}, []);

	const handleClosePanel = React.useCallback(() => {
		setIsPanelOpen(false);
	}, []);

	// Determine tooltip text based on count
	const tooltipText = React.useMemo(() => {
		if (unreadCount === 0) {
			return t('No new notifications', { _tags: 'core' });
		}
		if (unreadCount === 1) {
			return t('1 unread notification', { _tags: 'core' });
		}
		return t('{{count}} unread notifications', { _tags: 'core', count: unreadCount });
	}, [unreadCount, t]);

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Pressable
						onPress={handlePress}
						className="relative px-2"
						accessibilityLabel={tooltipText}
						accessibilityRole="button"
					>
						<Icon name="bell" className="text-sidebar-foreground" />
						{unreadCount > 0 && (
							<View className="absolute -right-0.5 -top-1">
								<Badge
									count={unreadCount}
									max={99}
									variant="destructive"
									size="sm"
								/>
							</View>
						)}
					</Pressable>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Text>{tooltipText}</Text>
				</TooltipContent>
			</Tooltip>

			<NotificationPanel isOpen={isPanelOpen} onClose={handleClosePanel} />
		</>
	);
}
