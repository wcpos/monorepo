import * as React from 'react';

import { ProGuard } from '@wcpos/core/screens/main/components/pro-guard';

const ProductsScreen = React.lazy(() =>
	import('@wcpos/core/screens/main/products').then((m) => ({ default: m.ProductsScreen }))
);

export default function ProductsPage() {
	return <ProGuard page="products" component={ProductsScreen} />;
}
