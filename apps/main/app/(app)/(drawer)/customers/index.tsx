import { withProAccess } from '@wcpos/core/screens/main/components/pro-guard';
import { CustomersScreen } from '@wcpos/core/screens/main/customers';

export default withProAccess(CustomersScreen, 'customers');
