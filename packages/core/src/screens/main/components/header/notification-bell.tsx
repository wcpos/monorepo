import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Badge } from '@wcpos/components/badge';
import { Text } from '@wcpos/components/text';
import { Icon } from '@wcpos/components/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';

import { useNovuNotificationsSummary } from '../../../../contexts/novu';
import { NotificationPanelContent } from './notification-panel';
import { useT } from '../../../../contexts/translations';

/**
 * NotificationBell component displays a bell icon with an unread count badge.
 * Clicking the bell opens a notification popover.
 */
export function NotificationBell({ showLabel = false }: { showLabel?: boolean }) {
	const t = useT();
	const { unreadCount, markAllAsSeen } = useNovuNotificationsSummary();
	const [isOpen, setIsOpen] = React.useState(false);

	const handleOpenChange = (open: boolean) => {
		setIsOpen(open);
		if (open) {
			void markAllAsSeen();
		}
	};

	return (
		// @ts-expect-error: open prop exists at runtime but is missing from @rn-primitives/popover RootProps type
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Pressable
					testID="drawer-item-notifications"
					className={`web:hover:bg-white/10 h-12 flex-row items-center gap-3 border-x-4 border-transparent px-3 active:bg-white/10 ${showLabel ? '' : 'justify-center'}`}
					accessibilityRole="button"
					accessibilityLabel={t('common.notifications')}
				>
					<View>
						<Icon name="bell" size="xl" className="text-sidebar-foreground" />
						{unreadCount > 0 && (
							<View className="absolute -top-1 -right-0.5">
								<Badge count={unreadCount} max={99} variant="destructive" size="sm" />
							</View>
						)}
					</View>
					{showLabel && (
						<Text className="text-sidebar-foreground pr-2">{t('common.notifications')}</Text>
					)}
				</Pressable>
			</PopoverTrigger>
			<PopoverContent side="bottom" align="center" className="flex max-h-96 w-80 flex-col p-0">
				<NotificationPanelContent />
			</PopoverContent>
		</Popover>
	);
}
