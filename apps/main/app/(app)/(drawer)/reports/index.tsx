import { withProAccess } from '@wcpos/core/screens/main/components/pro-guard';
import { ReportsScreen } from '@wcpos/core/screens/main/reports';

export default withProAccess(ReportsScreen, 'reports');
