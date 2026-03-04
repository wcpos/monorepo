import { withProAccess } from '@wcpos/core/screens/main/components/pro-guard';
import { CouponsScreen } from '@wcpos/core/screens/main/coupons';

export default withProAccess(CouponsScreen, 'coupons');
