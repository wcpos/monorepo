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
export function NotificationBell({
	testID,
	portalHost,
	bare = false,
}: {
	testID: string;
	portalHost?: string;
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
			<View>
				<DialogTrigger asChild>
					<IconButton
						name="notifications"
						variant={bare ? 'bare' : undefined}
						testID={testID}
						accessibilityLabel={t('common.notifications')}
					/>
				</DialogTrigger>
				{/* Always mounted: the badge has to be there to show the first one arrive. */}
				{/* Over the glyph, not the button: the offsets are the drawer's (`-top-1 -right-0.5`
				    from the icon box), so the badge sits on the bell's shoulder as the logs badge sits
				    on Store health's. Measured from the 44 button it floated 13 further up and out. A
				    centred box the icon's size (`size-4.5`, Icon's default, which `IconButton` never
				    overrides) holds for the title bar's strip-high button. */}
				<View pointerEvents="none" className="absolute inset-0 items-center justify-center">
					<View className="relative size-4.5">
						<View className="absolute -top-1 -right-0.5">
							<Badge count={unreadCount} max={99} variant="bad" size="sm" />
						</View>
					</View>
				</View>
			</View>
			<DialogContent side={side} size="lg" portalHost={portalHost} testID="notifications-sheet">
				{isOpen && <NotificationPanelContent />}
			</DialogContent>
		</Dialog>
	);
}
