import * as React from 'react';

import { Slot } from 'expo-router';

import { useAppInfo } from '@wcpos/core/hooks/use-app-info';
import { UpgradeNotice } from '@wcpos/core/screens/main/components/header/upgrade-notice';
import { UpgradeNoticeContext } from '@wcpos/core/screens/main/components/header/upgrade-notice-context';
import { useT } from '@wcpos/core/contexts/translations';
import { NavigationAreaLayout } from '@wcpos/core/screens/main/components/navigation-area';

import { useSettingsNavigationItems } from '../../../../../components/area-navigation/settings';

export default function SettingsLayout() {
	const items = useSettingsNavigationItems();
	const t = useT();
	const { license } = useAppInfo();
	const { showUpgrade, setShowUpgrade } = React.useContext(UpgradeNoticeContext);

	return (
		<NavigationAreaLayout
			items={items}
			indexHref="/settings"
			areaLabel={t('common.settings')}
			testID="settings-navigation"
			screenTestID="settings-screen"
			barTestID="settings-bar"
			barNotice={
				showUpgrade && !license?.isPro && <UpgradeNotice setShowUpgrade={setShowUpgrade} />
			}
		>
			<Slot />
		</NavigationAreaLayout>
	);
}
