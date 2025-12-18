import { withProAccess } from '@wcpos/core/screens/main/components/pro-guard';
import { ProductsScreen } from '@wcpos/core/screens/main/products';

export default withProAccess(ProductsScreen, 'products');
