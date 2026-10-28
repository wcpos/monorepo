import * as React from 'react';
import { View } from 'react-native';

import { Badge } from '@wcpos/components/badge';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { NavItem } from '@wcpos/components/nav-item';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';

import { useNovuNotificationsSummary } from '../../../../contexts/novu';
import { NotificationPanelContent } from './notification-panel';
import { useT } from '../../../../contexts/translations';

/**
 * NotificationBell component displays a bell icon with an unread count badge.
 * Clicking the bell opens a notification popover.
 */
export function NotificationBell({
	showLabel = false,
	testID = 'drawer-item-notifications',
	portalHost,
}: {
	showLabel?: boolean;
	testID?: string;
	portalHost?: string;
}) {
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
			{showLabel ? (
				<PopoverTrigger asChild>
					<NavItem
						size="drawer"
						testID={testID}
						accessibilityLabel={t('common.notifications')}
						label={t('common.notifications')}
						icon={
							<View>
								<Icon name="notifications" size="xl" className="text-sidebar-foreground" />
								{/* Always mounted: the badge has to be there to show the first one arrive. */}
								<View className="absolute -top-1 -right-0.5">
									<Badge count={unreadCount} max={99} variant="bad" size="sm" />
								</View>
							</View>
						}
					/>
				</PopoverTrigger>
			) : (
				<View>
					<PopoverTrigger asChild>
						<IconButton
							name="notifications"
							testID={testID}
							accessibilityLabel={t('common.notifications')}
						/>
					</PopoverTrigger>
					<View pointerEvents="none" className="absolute -top-1 -right-0.5">
						<Badge count={unreadCount} max={99} variant="bad" size="sm" />
					</View>
				</View>
			)}
			<PopoverContent
				portalHost={portalHost}
				side="bottom"
				align="center"
				className="flex max-h-96 w-80 flex-col p-0"
			>
				<NotificationPanelContent />
			</PopoverContent>
		</Popover>
	);
}
