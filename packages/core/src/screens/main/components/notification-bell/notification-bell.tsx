import * as React from 'react';
import { View } from 'react-native';

import { Badge } from '@wcpos/components/badge';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { NavItem } from '@wcpos/components/nav-item';
import { Dialog, DialogContent } from '@wcpos/components/dialog';

import { useNovuNotificationsSummary } from '../../../../contexts/novu';
import { NotificationPanelContent } from './notification-panel';
import { useT } from '../../../../contexts/translations';
import { usePanelSide } from '../../pos/contexts/overlay-side';

/**
 * NotificationBell component displays a bell icon with an unread count badge.
 * Clicking the bell opens a notification side panel.
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
	const side = usePanelSide('shell');
	const { unreadCount, markAllAsSeen } = useNovuNotificationsSummary();
	const [isOpen, setIsOpen] = React.useState(false);

	const handleOpenChange = (open: boolean) => {
		setIsOpen(open);
		if (open) {
			void markAllAsSeen();
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			{showLabel ? (
				<NavItem
					size="drawer"
					className="mx-2"
					testID={testID}
					onPress={() => handleOpenChange(true)}
					accessibilityLabel={t('common.notifications')}
					label={t('common.notifications')}
					icon={
						<View>
							<Icon name="notifications" size="xl" className="text-sidebar-foreground" />
							{/* Always mounted: the badge has to be there to show the first one arrive. */}
							<View className="absolute -top-1 -right-0.5">
								<Badge count={unreadCount} max={99} variant="destructive" size="sm" />
							</View>
						</View>
					}
				/>
			) : (
				<View>
					<IconButton
						name="notifications"
						testID={testID}
						onPress={() => handleOpenChange(true)}
						accessibilityLabel={t('common.notifications')}
					/>
					<View pointerEvents="none" className="absolute -top-1 -right-0.5">
						<Badge count={unreadCount} max={99} variant="destructive" size="sm" />
					</View>
				</View>
			)}
			<DialogContent side={side} size="lg" portalHost={portalHost} testID="notifications-sheet">
				{isOpen && <NotificationPanelContent />}
			</DialogContent>
		</Dialog>
	);
}
