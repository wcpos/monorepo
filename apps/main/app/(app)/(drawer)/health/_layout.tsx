import * as React from 'react';

import { Slot } from 'expo-router';

import { useAppInfo } from '@wcpos/core/hooks/use-app-info';
import { UpgradeNotice } from '@wcpos/core/screens/main/components/upgrade-notice';
import { UpgradeNoticeContext } from '@wcpos/core/screens/main/components/upgrade-notice/context';
import { useT } from '@wcpos/core/contexts/translations';
import { NavigationAreaLayout } from '@wcpos/core/screens/main/components/navigation-area';

import { useHealthNavigationItems } from '../../../../components/area-navigation/health';
import { useUnreadLogsCount } from '../../../../components/unread-logs';

export default function HealthLayout() {
	const count = useUnreadLogsCount();
	const items = useHealthNavigationItems(count);
	const t = useT();
	const { license } = useAppInfo();
	const { showUpgrade, setShowUpgrade } = React.useContext(UpgradeNoticeContext);

	// Health pages carry their own heading (`AreaPage`), as Settings does, so on a phone the bar
	// shows only the way back: one title, the bigger one in the page (owner, 2026-10-13).
	return (
		<NavigationAreaLayout
			items={items}
			indexHref="/health"
			areaLabel={t('common.store_health')}
			testID="health-navigation"
			screenTestID="health-screen"
			barTestID="health-bar"
			leafPagesCarryTitle
			barNotice={
				showUpgrade && !license?.isPro && <UpgradeNotice setShowUpgrade={setShowUpgrade} />
			}
		>
			<Slot />
		</NavigationAreaLayout>
	);
}
