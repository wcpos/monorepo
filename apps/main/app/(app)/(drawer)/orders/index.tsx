import { withProAccess } from '@wcpos/core/screens/main/components/pro-guard';
import { OrdersScreen } from '@wcpos/core/screens/main/orders';

export default withProAccess(OrdersScreen, 'orders');
