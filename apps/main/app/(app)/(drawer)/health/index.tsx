import * as React from 'react';

import { NavigationAreaIndex } from '@wcpos/core/screens/main/components/navigation-area';

import { useHealthNavigationItems } from '../../../../components/area-navigation/health';
import { useUnreadLogsCount } from '../../../../components/unread-logs';

export default function HealthIndex() {
	const count = useUnreadLogsCount();
	const items = useHealthNavigationItems(count);

	return (
		<NavigationAreaIndex items={items} defaultHref="/health/database" testID="screen-health" />
	);
}
