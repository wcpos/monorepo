import * as React from 'react';

import { Badge } from '@wcpos/components/badge';
import { useT } from '@wcpos/core/contexts/translations';
import type { NavigationAreaItem } from '@wcpos/core/screens/main/components/navigation-area';

export function useHealthNavigationItems(unreadErrorCount: number): NavigationAreaItem[] {
	const t = useT();

	return [
		{
			href: '/health/database',
			label: t('common.database'),
			testID: 'health-nav-database',
		},
		{
			href: '/health/performance',
			label: t('common.performance'),
			testID: 'health-nav-performance',
		},
		{
			href: '/health/logs',
			label: t('common.logs'),
			testID: 'health-nav-logs',
			badge: <Badge count={unreadErrorCount} max={99} variant="bad" size="sm" />,
		},
	];
}
