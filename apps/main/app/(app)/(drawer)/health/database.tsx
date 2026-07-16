import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { HealthPlaceholder } from '@wcpos/core/screens/main/health';

export default function DatabaseHealthPage() {
	const t = useT();

	return (
		<HealthPlaceholder
			title={t('common.database', 'Database')}
			subtitle={t('common.coming_soon', 'Coming soon')}
			testID="screen-health-database"
		/>
	);
}
