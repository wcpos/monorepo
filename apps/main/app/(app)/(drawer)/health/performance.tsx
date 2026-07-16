import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { HealthPlaceholder } from '@wcpos/core/screens/main/health';

export default function PerformanceHealthPage() {
	const t = useT();

	return (
		<HealthPlaceholder
			title={t('common.performance', 'Performance')}
			subtitle={t('common.coming_soon', 'Coming soon')}
			testID="screen-health-performance"
		/>
	);
}
