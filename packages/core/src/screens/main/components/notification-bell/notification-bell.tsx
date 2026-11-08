import * as React from 'react';

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
export function NotificationBell({
	testID,
	bare = false,
}: {
	testID: string;
	/** The title bar's (`IconButton` `bare`): no surface on hover or press. */
	bare?: boolean;
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
			{/* The count is the glyph's (`IconButton count`): always mounted, so the first arrival is seen. */}
			<DialogTrigger asChild>
				<IconButton
					name="notifications"
					variant={bare ? 'bare' : undefined}
					count={unreadCount}
					testID={testID}
					accessibilityLabel={t('common.notifications')}
				/>
			</DialogTrigger>
			<DialogContent side={side} size="lg" testID="notifications-sheet">
				{isOpen && <NotificationPanelContent />}
			</DialogContent>
		</Dialog>
	);
}
