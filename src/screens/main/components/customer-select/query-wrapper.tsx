import Suspense from '@wcpos/components/src/suspense';

import Menu from './menu';
import { useQuery } from '../../hooks/use-query';

/**
 * I need to kick off the query here
 */
const CustomerQueryWrapper = (props) => {
	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['customers', 'select'],
		collectionName: 'customers',
		initialQuery: {
			sortBy: 'last_name',
			sortDirection: 'asc',
		},
	});

	return (
		<Suspense>
			<Menu query={query} {...props} />
		</Suspense>
	);
};

export default CustomerQueryWrapper;
