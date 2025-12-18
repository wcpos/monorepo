import * as React from 'react';

import { ProGuard } from '@wcpos/core/screens/main/components/pro-guard';

const OrdersScreen = React.lazy(() =>
	import('@wcpos/core/screens/main/orders').then((m) => ({ default: m.OrdersScreen }))
);

export default function OrdersPage() {
	return <ProGuard page="orders" component={OrdersScreen} />;
}
