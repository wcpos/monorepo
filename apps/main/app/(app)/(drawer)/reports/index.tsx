import * as React from 'react';

import { ProGuard } from '@wcpos/core/screens/main/components/pro-guard';

const ReportsScreen = React.lazy(() =>
	import('@wcpos/core/screens/main/reports').then((m) => ({ default: m.ReportsScreen }))
);

export default function ReportsPage() {
	return <ProGuard page="reports" component={ReportsScreen} />;
}
