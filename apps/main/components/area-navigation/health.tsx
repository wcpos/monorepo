import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { LogsBadge } from '@wcpos/core/screens/main/components/drawer-content/logs-badge';
import type { NavigationAreaItem } from '@wcpos/core/screens/main/components/navigation-area';

export function useHealthNavigationItems(unreadErrorCount: number): NavigationAreaItem[] {
	const t = useT();

	return [
		{
			href: '/health/database',
			label: t('common.database', 'Database'),
			testID: 'health-nav-database',
		},
		{
			href: '/health/performance',
			label: t('common.performance', 'Performance'),
			testID: 'health-nav-performance',
		},
		{
			href: '/health/logs',
			label: t('common.logs'),
			testID: 'health-nav-logs',
			badge: <LogsBadge count={unreadErrorCount} />,
		},
	];
}
