import { withProAccess } from '@wcpos/core/screens/main/components/pro-guard';
import { AddCouponScreen } from '@wcpos/core/screens/main/coupons/add';

export default withProAccess(AddCouponScreen, 'coupons');
