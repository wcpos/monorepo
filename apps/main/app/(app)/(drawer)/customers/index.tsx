import * as React from 'react';

import { ProGuard } from '@wcpos/core/screens/main/components/pro-guard';

const CustomersScreen = React.lazy(() =>
	import('@wcpos/core/screens/main/customers').then((m) => ({ default: m.CustomersScreen }))
);

export default function CustomersPage() {
	return <ProGuard page="customers" component={CustomersScreen} />;
}
