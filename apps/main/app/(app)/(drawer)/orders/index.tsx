import { withProAccess } from '@wcpos/core/screens/main/components/pro-guard';
import { OrdersScreen } from '@wcpos/core/screens/main/orders/v2';

export default withProAccess(OrdersScreen, 'orders');
