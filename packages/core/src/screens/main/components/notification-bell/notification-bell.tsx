import * as React from 'react';
import { View } from 'react-native';

import { Badge } from '@wcpos/components/badge';
import { IconButton } from '@wcpos/components/icon-button';
import { Dialog, DialogContent, DialogTrigger } from '@wcpos/components/dialog';

import { useNovuNotificationsSummary } from '../../../../contexts/novu';
import { NotificationPanelContent } from './notification-panel';
import { useT } from '../../../../contexts/translations';
import { usePanelSide } from '../../pos/contexts/overlay-side';

/**
 * NotificationBell component displays a bell icon with an unread count badge.
 * Clicking the bell opens a notification side panel. It lives in the bars only (`BarControls`):
 * the front drawer's labelled row went on 2026-10-28, when every bar already carried the bell.
 */
export function NotificationBell({ testID, portalHost }: { testID: string; portalHost?: string }) {
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
			<View>
				<DialogTrigger asChild>
					<IconButton
						name="notifications"
						testID={testID}
						accessibilityLabel={t('common.notifications')}
					/>
				</DialogTrigger>
				{/* Always mounted: the badge has to be there to show the first one arrive. */}
				<View pointerEvents="none" className="absolute -top-1 -right-0.5">
					<Badge count={unreadCount} max={99} variant="bad" size="sm" />
				</View>
			</View>
			<DialogContent side={side} size="lg" portalHost={portalHost} testID="notifications-sheet">
				{isOpen && <NotificationPanelContent />}
			</DialogContent>
		</Dialog>
	);
}
